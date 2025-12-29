// Trilium 保存监控插件 - v1.1
// 功能：监控笔记保存状态，网络异常或保存失败时及时提醒
// 使用说明：
// 1. 在 Trilium 中创建一个代码笔记
// 2. 将此代码粘贴进去
// 3. 设置笔记类型为 "Code" (JavaScript)
// 4. 添加标签 #run=frontendStartup 和 #run=mobileStartup
// 5. 刷新 Trilium (F5)

class TriliumSaveMonitor {
    constructor() {
        this.saveTimeout = 10000; // 保存超时时间：10 秒
        this.pendingSaves = new Map(); // 记录正在进行的保存操作
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.isOnline = navigator.onLine;

        console.log('[保存监控] 插件初始化');
    }

    async init() {
        this.interceptServerCalls();
        this.setupNetworkListeners();
        this.addStyles();

        console.log('[保存监控] 监控已启动');
        this.showNotification('保存监控已启用 ✓', 'success', 2000);
    }

    interceptServerCalls() {
        const self = this;

        // 等待 jQuery 加载
        const waitForJQuery = setInterval(() => {
            if (typeof $ !== 'undefined' && $.ajax) {
                clearInterval(waitForJQuery);
                self.setupJQueryInterceptor();
            }
        }, 100);

        // 超时保护：10秒后停止等待
        setTimeout(() => {
            clearInterval(waitForJQuery);
            if (typeof $ === 'undefined' || !$.ajax) {
                console.error('[保存监控] jQuery 未找到，无法拦截保存请求');
            }
        }, 10000);
    }

    setupJQueryInterceptor() {
        const self = this;

        // 保存原始的 $.ajax 函数
        const originalAjax = $.ajax;

        // 重写 $.ajax 函数
        $.ajax = function(url, options) {
            // jQuery.ajax 可以接受两种调用方式：
            // 1. $.ajax(url, options)
            // 2. $.ajax(options)  <- Trilium 使用这种方式

            // 先统一参数格式
            let actualUrl = url;
            let settings = options;

            if (typeof url === 'object') {
                // 单参数形式：$.ajax({ url: ..., type: 'PUT', ... })
                settings = url;
                actualUrl = settings.url;
            }

            // 只监控保存笔记的 PUT 请求
            const isSaveRequest = actualUrl &&
                actualUrl.includes('api/notes/') &&  // 移除开头的斜杠
                actualUrl.includes('/data') &&
                (settings?.type === 'PUT' || settings?.method === 'PUT');

            if (isSaveRequest) {
                console.log(`[保存监控] 检测到保存请求: ${actualUrl}`);
                return self.monitorJQuerySaveRequest(originalAjax, actualUrl, settings);
            }

            // 其他请求直接调用原始 ajax
            return originalAjax.apply(this, arguments);
        };

        console.log('[保存监控] 已拦截 jQuery AJAX 请求');
    }

    monitorJQuerySaveRequest(originalAjax, url, settings) {
        const noteId = this.extractNoteId(url);
        const saveId = `${noteId}-${Date.now()}`;

        console.log(`[保存监控] 开始保存: ${noteId}`);

        // 记录保存开始时间
        const startTime = Date.now();
        this.pendingSaves.set(saveId, {
            noteId,
            startTime,
            url
        });

        // 设置超时检测
        const timeoutId = setTimeout(() => {
            if (this.pendingSaves.has(saveId)) {
                this.handleSaveTimeout(saveId);
            }
        }, this.saveTimeout);

        // 保存原始的回调函数
        const originalSuccess = settings.success;
        const originalError = settings.error;
        const originalComplete = settings.complete;

        // 修改 settings，添加我们的监控逻辑
        const monitoredSettings = {
            ...settings,
            success: (data, textStatus, jqXHR) => {
                clearTimeout(timeoutId);
                this.pendingSaves.delete(saveId);

                const duration = Date.now() - startTime;
                this.handleSaveSuccess(noteId, duration);

                // 调用原始的 success 回调
                if (originalSuccess) {
                    originalSuccess.call(this, data, textStatus, jqXHR);
                }
            },
            error: (jqXHR, textStatus, errorThrown) => {
                clearTimeout(timeoutId);
                this.pendingSaves.delete(saveId);

                const duration = Date.now() - startTime;

                // 判断错误类型
                if (jqXHR.status === 0) {
                    // 网络错误
                    this.handleSaveException(noteId, new Error('网络连接失败'), duration);
                } else {
                    // HTTP 错误
                    this.handleSaveError(noteId, jqXHR.status, jqXHR.statusText || errorThrown, duration);
                }

                // 调用原始的 error 回调
                if (originalError) {
                    originalError.call(this, jqXHR, textStatus, errorThrown);
                }
            }
        };

        // 调用原始 ajax 函数
        return originalAjax.call(this, url, monitoredSettings);
    }

    extractNoteId(url) {
        // 从 URL 中提取 noteId
        // 格式: api/notes/{noteId}/data (没有开头的斜杠)
        const match = url.match(/api\/notes\/([^\/]+)\/data/);
        return match ? match[1] : 'unknown';
    }

    handleSaveSuccess(noteId, duration) {
        // 重置失败计数
        this.failureCount = 0;

        // 只在保存较慢时提示
        if (duration > 3000) {
            console.log(`[保存监控] 保存成功但较慢: ${noteId} (${duration}ms)`);
            this.showNotification(`⚠️ 保存成功但耗时 ${(duration / 1000).toFixed(1)}秒\n网络可能较慢`, 'warning', 3000);
        } else {
            console.log(`[保存监控] 保存成功: ${noteId} (${duration}ms)`);
        }
    }

    handleSaveError(noteId, status, statusText, duration) {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        console.error(`[保存监控] 保存失败: ${noteId}, HTTP ${status} ${statusText}`);

        let message = `❌ 笔记保存失败！\n\nHTTP ${status}: ${statusText}`;

        if (status === 401 || status === 403) {
            message += '\n\n可能原因：会话已过期，请刷新页面';
        } else if (status === 413) {
            message += '\n\n可能原因：内容过大';
        } else if (status >= 500) {
            message += '\n\n可能原因：服务器错误';
        }

        this.showNotification(message, 'error', 0);
        this.showSystemAlert(message);
    }

    handleSaveException(noteId, error, duration) {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        const errorType = this.classifyError(error);

        console.error(`[保存监控] 保存异常: ${noteId}`, error);

        let message = `❌ 笔记保存失败！\n\n`;

        switch (errorType) {
            case 'network':
                message += '网络连接失败\n请检查网络连接';
                break;
            case 'timeout':
                message += '保存超时\n网络响应太慢';
                break;
            case 'abort':
                message += '保存被中断\n可能是网络问题';
                break;
            default:
                message += `错误: ${error.message || error.toString()}`;
        }

        message += `\n\n请确保内容已保存后再关闭页面！`;

        this.showNotification(message, 'error', 0);
        this.showSystemAlert(message);
    }

    handleSaveTimeout(saveId) {
        const saveInfo = this.pendingSaves.get(saveId);
        if (!saveInfo) return;

        this.pendingSaves.delete(saveId);
        this.failureCount++;
        this.lastFailureTime = Date.now();

        const duration = Date.now() - saveInfo.startTime;

        console.error(`[保存监控] 保存超时: ${saveInfo.noteId} (${duration}ms)`);

        const message = `⏱️ 笔记保存超时！\n\n保存操作已超过 ${this.saveTimeout / 1000} 秒\n网络可能存在问题\n\n请检查网络连接！`;

        this.showNotification(message, 'error', 0);
        this.showSystemAlert(message);
    }

    classifyError(error) {
        const errorMsg = error.message?.toLowerCase() || error.toString().toLowerCase();

        if (errorMsg.includes('failed to fetch') ||
            errorMsg.includes('network') ||
            errorMsg.includes('networkerror')) {
            return 'network';
        }

        if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
            return 'timeout';
        }

        if (errorMsg.includes('abort')) {
            return 'abort';
        }

        return 'unknown';
    }

    setupNetworkListeners() {
        // 监听网络状态变化
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('[保存监控] 网络已连接');

            this.showNotification('✅ 网络已恢复\n可以正常保存了', 'success', 3000);

            // 重置失败计数
            this.failureCount = 0;
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.error('[保存监控] 网络已断开');

            this.showNotification(
                '❌ 网络连接已断开！\n\n无法保存笔记\n请检查网络连接',
                'error',
                0 // 持续显示
            );

            this.showSystemAlert('网络连接已断开！无法保存笔记内容，请检查网络连接！');
        });

        // 页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.failureCount > 0 && this.lastFailureTime) {
                const timeSinceFailure = Date.now() - this.lastFailureTime;

                // 如果最近 5 分钟内有失败，提醒用户
                if (timeSinceFailure < 5 * 60 * 1000) {
                    this.showNotification(
                        `⚠️ 注意：页面切换回来前有 ${this.failureCount} 次保存失败\n请检查笔记内容是否完整`,
                        'warning',
                        5000
                    );
                }
            }
        });

        // 页面关闭前检查
        window.addEventListener('beforeunload', (event) => {
            if (this.pendingSaves.size > 0) {
                const message = '有笔记正在保存中，确定要关闭吗？';
                event.preventDefault();
                event.returnValue = message;
                return message;
            }

            if (this.failureCount > 0 && this.lastFailureTime) {
                const timeSinceFailure = Date.now() - this.lastFailureTime;
                if (timeSinceFailure < 2 * 60 * 1000) {
                    const message = '最近有保存失败，内容可能未保存，确定要关闭吗？';
                    event.preventDefault();
                    event.returnValue = message;
                    return message;
                }
            }
        });

        console.log('[保存监控] 网络监听器已设置');
    }

    showNotification(message, type = 'info', duration = 3000) {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `save-monitor-notification save-monitor-${type}`;
        notification.innerHTML = `
            <div class="save-monitor-icon">${this.getIcon(type)}</div>
            <div class="save-monitor-message">${message.replace(/\n/g, '<br>')}</div>
            ${duration === 0 ? '<div class="save-monitor-close" onclick="this.parentElement.remove()">✕</div>' : ''}
        `;

        document.body.appendChild(notification);

        // 自动关闭（如果设置了 duration）
        if (duration > 0) {
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }, duration);
        }

        console.log(`[保存监控] 通知: [${type}] ${message}`);
    }

    showSystemAlert(message) {
        // 使用系统弹窗作为额外提醒（保存失败时）
        setTimeout(() => {
            if (confirm(message + '\n\n点击"确定"查看控制台获取更多信息')) {
                console.log('[保存监控] 详细错误信息:', {
                    failureCount: this.failureCount,
                    lastFailureTime: new Date(this.lastFailureTime),
                    pendingSaves: Array.from(this.pendingSaves.entries()),
                    isOnline: this.isOnline
                });
            }
        }, 100);
    }

    getIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    addStyles() {
        if (document.getElementById('save-monitor-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'save-monitor-styles';
        style.textContent = `
            .save-monitor-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                min-width: 300px;
                max-width: 450px;
                padding: 16px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 100000;
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                animation: slideInRight 0.3s ease-out;
                display: flex;
                align-items: flex-start;
                gap: 12px;
                backdrop-filter: blur(10px);
            }

            .save-monitor-notification.save-monitor-success {
                background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
            }

            .save-monitor-notification.save-monitor-error {
                background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
                border: 2px solid #ff1744;
            }

            .save-monitor-notification.save-monitor-warning {
                background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
            }

            .save-monitor-notification.save-monitor-info {
                background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
            }

            .save-monitor-icon {
                font-size: 24px;
                font-weight: bold;
                flex-shrink: 0;
            }

            .save-monitor-message {
                flex: 1;
                font-size: 14px;
                line-height: 1.5;
            }

            .save-monitor-close {
                font-size: 20px;
                cursor: pointer;
                opacity: 0.8;
                padding: 0 4px;
                flex-shrink: 0;
            }

            .save-monitor-close:hover {
                opacity: 1;
            }

            @keyframes slideInRight {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            /* 移动端适配 */
            @media (max-width: 768px) {
                .save-monitor-notification {
                    top: 10px;
                    right: 10px;
                    left: 10px;
                    min-width: auto;
                    max-width: none;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // 获取监控状态
    getStatus() {
        return {
            isOnline: this.isOnline,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime) : null,
            pendingSaves: this.pendingSaves.size,
            timeout: this.saveTimeout
        };
    }

    // 设置保存超时时间
    setTimeout(ms) {
        this.saveTimeout = ms;
        console.log(`[保存监控] 超时时间已设置为: ${ms}ms`);
    }

    // 重置失败计数
    resetFailureCount() {
        this.failureCount = 0;
        this.lastFailureTime = null;
        console.log('[保存监控] 失败计数已重置');
    }
}

// 自动初始化
(async function() {
    try {
        const monitor = new TriliumSaveMonitor();
        await monitor.init();

        // 暴露到全局，方便调试
        window.triliumSaveMonitor = monitor;

        console.log('[保存监控] 插件可通过 window.triliumSaveMonitor 访问');
        console.log('[保存监控] 可用方法:');
        console.log('  - window.triliumSaveMonitor.getStatus() - 查看状态');
        console.log('  - window.triliumSaveMonitor.setTimeout(毫秒) - 设置超时时间');
        console.log('  - window.triliumSaveMonitor.resetFailureCount() - 重置失败计数');

    } catch (error) {
        console.error('[保存监控] 初始化失败:', error);
    }
})();
