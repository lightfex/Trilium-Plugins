// Trilium 批注插件 - v3.2 (多行输入增强版)
// 更新日志：
// v3.2: 【用户体验改进】支持多行文本输入，增大输入窗口，支持滚动
// v3.1: 将批注内容编码到链接 URL 中
// 使用说明：
// 1. 在 Trilium 中创建一个代码笔记
// 2. 将此代码粘贴进去
// 3. 设置笔记类型为 "Code" (JavaScript)
// 4. 添加标签 #run=frontendStartup
// 5. 刷新 Trilium (F5)

class TriliumAnnotationPlugin {
    constructor() {
        this.annotationCount = 0;
        console.log('[批注插件] v3.2 初始化');
    }

    async init() {
        await this.waitForEditor();
        this.addStyles();
        this.setupAnnotationCommand();
        this.addToolbarButton();
        this.setupToolbarObserver();
        this.rebindExistingAnnotations();
        this.setupContentObserver();
        console.log('[批注插件] v3.2 初始化完成');
    }

    async waitForEditor() {
        return new Promise((resolve) => {
            const check = () => {
                const editorElement = document.querySelector('.ck-editor__editable');
                if (editorElement && editorElement.ckeditorInstance) {
                    setTimeout(resolve, 200);
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    setupAnnotationCommand() {
        const editorElement = document.querySelector('.ck-editor__editable');
        if (!editorElement || !editorElement.ckeditorInstance) {
            console.warn('[批注插件] 未找到编辑器实例');
            return;
        }

        const editor = editorElement.ckeditorInstance;
        editor.commands.add('addAnnotation', {
            execute: () => {
                this.handleAddAnnotation(editor);
            }
        });

        console.log('[批注插件] 批注命令已注册');
    }

    addToolbarButton() {
        const toolbar = document.querySelector('.classic-toolbar-widget:not(.hidden-ext) .ck-toolbar__items');
        if (!toolbar || toolbar.querySelector('.annotation-button')) {
            return;
        }

        const item = document.createElement('div');
        item.className = 'ck ck-toolbar__item';

        const button = document.createElement('button');
        button.className = 'annotation-button annotation-toolbar-btn';
        button.type = 'button';
        button.title = '添加批注 (选中文字后点击)';
        button.style.cssText = 'background: transparent; border: 0; cursor: pointer; padding: 0.4em; margin: 0; display: flex; align-items: center;';
        button.innerHTML = `
            <svg class="ck ck-icon ck-button__icon" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; fill: currentColor;">
                <path d="M18 2H2c-.6 0-1 .4-1 1v14c0 .6.4 1 1 1h16c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1zM3 4h14v3H3V4zm0 5h14v2H3V9zm0 4h9v2H3v-2z"/>
            </svg>
        `;

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const editorElement = document.querySelector('.ck-editor__editable');
            if (editorElement && editorElement.ckeditorInstance) {
                this.handleAddAnnotation(editorElement.ckeditorInstance);
            }
        });

        item.appendChild(button);

        const linkButton = toolbar.querySelector('.ck-link-ui');
        if (linkButton && linkButton.parentElement) {
            linkButton.parentElement.insertAdjacentElement('afterend', item);
        } else {
            toolbar.appendChild(item);
        }

        console.log('[批注插件] 批注按钮已添加');
    }

    setupToolbarObserver() {
        const observer = new MutationObserver(() => {
            setTimeout(() => this.addToolbarButton(), 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        console.log('[批注插件] 工具栏监视器已启动');
    }

    setupContentObserver() {
        const editorElement = document.querySelector('.ck-editor__editable');
        if (!editorElement) return;

        const observer = new MutationObserver(() => {
            clearTimeout(this.rebindTimer);
            this.rebindTimer = setTimeout(() => {
                this.rebindExistingAnnotations();
            }, 500);
        });

        observer.observe(editorElement, { childList: true, subtree: true });
        console.log('[批注插件] 内容监视器已启动');
    }

    rebindExistingAnnotations() {
        const editorElement = document.querySelector('.ck-editor__editable');
        if (!editorElement) return;

        const links = editorElement.querySelectorAll('a[href*="#annotation-"]');
        console.log('[批注插件] 重新绑定批注链接:', links.length);

        links.forEach(link => {
            const newLink = link.cloneNode(true);
            link.parentNode.replaceChild(newLink, link);

            if (!newLink.classList.contains('annotation-link')) {
                newLink.classList.add('annotation-link');
            }

            newLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.viewAnnotation(newLink);
            });
        });
    }

    async handleAddAnnotation(editor) {
        try {
            const selection = editor.model.document.selection;

            if (selection.isCollapsed) {
                this.showNotification('请先选中要批注的文字', 'warning');
                return;
            }

            const selectedText = this.getSelectedText(editor);
            console.log('[批注插件] 选中文本:', selectedText);

            if (!selectedText || selectedText.trim() === '') {
                this.showNotification('请选择有效的文字', 'warning');
                return;
            }

            const range = selection.getFirstRange();
            const startPath = range.start.path;
            const endPath = range.end.path;

            const annotationText = await this.showInputDialog('请输入批注内容：', '');

            if (!annotationText || typeof annotationText !== 'string' || annotationText.trim() === '') {
                return;
            }

            const annotationId = `annotation-${Date.now()}-${++this.annotationCount}`;

            // 将批注内容编码到 URL 中
            const encodedText = encodeURIComponent(annotationText);
            const linkUrl = `#${annotationId}?text=${encodedText}`;

            console.log('[批注插件] 生成批注链接:', linkUrl);

            await new Promise(resolve => setTimeout(resolve, 150));

            editor.model.change(writer => {
                try {
                    const root = editor.model.document.getRoot();
                    const start = writer.createPositionFromPath(root, startPath);
                    const end = writer.createPositionFromPath(root, endPath);
                    const newRange = writer.createRange(start, end);

                    writer.setAttribute('linkHref', linkUrl, newRange);
                    console.log('[批注插件] 已添加 linkHref:', linkUrl);
                } catch (e) {
                    console.error('[批注插件] 添加属性时出错:', e);
                    throw e;
                }
            });

            setTimeout(() => {
                this.rebindExistingAnnotations();
            }, 300);

            this.showNotification('批注添加成功！', 'success');
            console.log('[批注插件] 批注已添加');

        } catch (error) {
            console.error('[批注插件] 错误:', error);
            this.showNotification('添加批注失败: ' + error.message, 'error');
        }
    }

    async showInputDialog(message, defaultValue = '') {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'annotation-input-dialog';
            dialog.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: var(--main-background-color, white);
                border: 1px solid var(--main-border-color, #ccc);
                border-radius: 8px;
                padding: 24px;
                z-index: 100000;
                box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
                min-width: 600px;
                max-width: 800px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
            `;

            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 99999;
            `;

            // HTML 转义处理
            const escapeHtml = (text) => {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            };

            dialog.innerHTML = `
                <div style="margin-bottom: 16px; font-size: 16px; font-weight: 600; color: var(--main-text-color, #333);">
                    ${message}
                </div>
                <textarea class="annotation-input-field form-control"
                          style="width: 100%;
                                 min-height: 180px;
                                 max-height: 400px;
                                 padding: 12px;
                                 border: 1px solid var(--main-border-color, #ccc);
                                 border-radius: 4px;
                                 margin-bottom: 16px;
                                 font-size: 14px;
                                 font-family: inherit;
                                 line-height: 1.6;
                                 resize: vertical;
                                 overflow-y: auto;"
                          placeholder="在此输入批注内容，支持多行输入...">${escapeHtml(defaultValue)}</textarea>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 12px; color: var(--muted-text-color, #666);">
                        💡 提示：支持多行输入，可拖动右下角调整大小
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="annotation-cancel-btn btn btn-sm"
                                style="padding: 8px 20px; font-size: 14px;">取消</button>
                        <button class="annotation-confirm-btn btn btn-primary btn-sm"
                                style="padding: 8px 20px; font-size: 14px;">确定</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            document.body.appendChild(dialog);

            const textarea = dialog.querySelector('.annotation-input-field');
            const confirmBtn = dialog.querySelector('.annotation-confirm-btn');
            const cancelBtn = dialog.querySelector('.annotation-cancel-btn');

            setTimeout(() => {
                textarea.focus();
                // 将光标移到文本末尾
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            }, 100);

            const confirm = () => {
                const value = textarea.value;
                cleanup();
                resolve(value);
            };

            const cancel = () => {
                cleanup();
                resolve(null);
            };

            const cleanup = () => {
                overlay.remove();
                dialog.remove();
            };

            confirmBtn.addEventListener('click', confirm);
            cancelBtn.addEventListener('click', cancel);
            overlay.addEventListener('click', cancel);

            // Ctrl+Enter 快捷键确认
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    confirm();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancel();
                }
            });
        });
    }

    async viewAnnotation(linkElement) {
        try {
            const href = linkElement.getAttribute('href') || '';
            console.log('[批注插件] 链接 href:', href);

            let annotationText = '';

            if (href.includes('?text=')) {
                const urlParts = href.split('?text=');
                if (urlParts.length > 1) {
                    annotationText = decodeURIComponent(urlParts[1]);
                }
            }

            console.log('[批注插件] 解码后的批注内容:', annotationText);

            if (!annotationText) {
                this.showNotification('未找到批注内容', 'warning');
                return;
            }

            const newText = await this.showInputDialog('批注内容（留空删除批注）：', annotationText);

            if (newText === null) {
                return;
            }

            if (newText.trim() === '') {
                // 删除批注
                const text = linkElement.textContent;
                const editorElement = document.querySelector('.ck-editor__editable');

                if (editorElement && editorElement.ckeditorInstance) {
                    const editor = editorElement.ckeditorInstance;
                    editor.model.change(writer => {
                        const viewElement = editor.editing.view.domConverter.mapDomToView(linkElement);
                        if (viewElement) {
                            const modelRange = editor.editing.mapper.toModelRange(
                                editor.editing.view.createRangeOn(viewElement)
                            );
                            if (modelRange) {
                                writer.removeAttribute('linkHref', modelRange);
                            }
                        }
                    });
                } else {
                    linkElement.replaceWith(document.createTextNode(text));
                }

                this.showNotification('批注已删除', 'info');
            } else {
                // 更新批注
                const href = linkElement.getAttribute('href') || '';
                const baseHref = href.split('?')[0];
                const encodedText = encodeURIComponent(newText);
                const newHref = `${baseHref}?text=${encodedText}`;

                const editorElement = document.querySelector('.ck-editor__editable');
                if (editorElement && editorElement.ckeditorInstance) {
                    const editor = editorElement.ckeditorInstance;
                    editor.model.change(writer => {
                        const viewElement = editor.editing.view.domConverter.mapDomToView(linkElement);
                        if (viewElement) {
                            const modelRange = editor.editing.mapper.toModelRange(
                                editor.editing.view.createRangeOn(viewElement)
                            );
                            if (modelRange) {
                                writer.setAttribute('linkHref', newHref, modelRange);
                            }
                        }
                    });
                } else {
                    linkElement.setAttribute('href', newHref);
                }

                this.showNotification('批注已更新', 'success');
                console.log('[批注插件] 批注已更新为:', newText);
            }
        } catch (error) {
            console.error('[批注插件] 查看批注时出错:', error);
            this.showNotification('操作失败: ' + error.message, 'error');
        }
    }

    getSelectedText(editor) {
        const selection = editor.model.document.selection;
        const range = selection.getFirstRange();
        let text = '';

        for (const item of range.getItems()) {
            if (item.is('$textProxy') || item.is('$text')) {
                text += item.data;
            }
        }

        return text.trim();
    }

    addStyles() {
        if (document.getElementById('annotation-plugin-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'annotation-plugin-styles';
        style.textContent = `
            .ck-content a[href*="#annotation-"] {
                background-color: #fff3cd !important;
                border-bottom: 2px solid #ffc107 !important;
                padding: 2px 4px !important;
                border-radius: 2px !important;
                cursor: help !important;
                text-decoration: none !important;
                color: inherit !important;
                transition: all 0.2s ease !important;
            }

            .ck-content a[href*="#annotation-"]:hover {
                background-color: #ffe69c !important;
                border-bottom-color: #ff9800 !important;
                box-shadow: 0 2px 4px rgba(255, 193, 7, 0.3) !important;
            }

            .annotation-toolbar-btn {
                background: transparent !important;
                border: 0 !important;
                cursor: pointer !important;
                padding: 0.4em !important;
                margin: 0 !important;
            }

            .annotation-toolbar-btn:hover {
                background: rgba(0, 0, 0, 0.05) !important;
            }

            .annotation-toolbar-btn .ck-icon {
                width: 20px !important;
                height: 20px !important;
                fill: currentColor !important;
            }

            .annotation-notification {
                position: fixed;
                top: 60px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                z-index: 100000;
                color: white;
                font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                animation: slideInRight 0.3s ease-out;
                max-width: 300px;
            }

            .annotation-notification.success {
                background: #4caf50;
            }

            .annotation-notification.error {
                background: #f44336;
            }

            .annotation-notification.warning {
                background: #ff9800;
            }

            .annotation-notification.info {
                background: #2196f3;
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

            /* 自定义滚动条样式（可选） */
            .annotation-input-field::-webkit-scrollbar {
                width: 8px;
            }

            .annotation-input-field::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 4px;
            }

            .annotation-input-field::-webkit-scrollbar-thumb {
                background: #888;
                border-radius: 4px;
            }

            .annotation-input-field::-webkit-scrollbar-thumb:hover {
                background: #555;
            }
        `;
        document.head.appendChild(style);
        console.log('[批注插件] 样式已加载');
    }

    showNotification(message, type = 'info') {
        if (typeof toastService !== 'undefined' && toastService.showMessage) {
            toastService.showMessage(message);
            return;
        }

        const notification = document.createElement('div');
        notification.className = `annotation-notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// 自动初始化
(async function() {
    try {
        const plugin = new TriliumAnnotationPlugin();
        await plugin.init();
        window.triliumAnnotationPlugin = plugin;
    } catch (error) {
        console.error('[批注插件] 初始化失败:', error);
    }
})();
