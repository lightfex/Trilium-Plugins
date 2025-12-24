// Trilium 批注插件 - v3.5 (浮动工具栏最终修复版)
// 更新日志：
// v3.5: 【关键修复】从现有按钮获取 ButtonView 类，解决运行时类访问问题
// v3.4: 直接修改 BalloonToolbar 的 items 配置
// v3.3-fixed: 修复 commands API 兼容性问题
// 使用说明：
// 1. 在 Trilium 中创建一个代码笔记
// 2. 将此代码粘贴进去
// 3. 设置笔记类型为 "Code" (JavaScript)
// 4. 添加标签 #run=frontendStartup
// 5. 刷新 Trilium (F5)

class TriliumAnnotationPlugin {
    constructor() {
        this.annotationCount = 0;
        this.registeredEditors = new WeakSet();
        console.log('[批注插件] v3.5 初始化');
    }

    async init() {
        await this.waitForEditor();
        this.addStyles();
        this.setupEditorHook();
        this.setupExistingEditors();
        this.rebindExistingAnnotations();
        this.setupContentObserver();
        console.log('[批注插件] v3.5 初始化完成 - 支持浮动工具栏');
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

    setupEditorHook() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(() => {
                const editors = document.querySelectorAll('.ck-editor__editable');
                editors.forEach(el => {
                    if (el.ckeditorInstance && !this.registeredEditors.has(el.ckeditorInstance)) {
                        this.registerAnnotationPlugin(el.ckeditorInstance);
                        this.registeredEditors.add(el.ckeditorInstance);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('[批注插件] 编辑器钩子已安装');
    }

    setupExistingEditors() {
        const editors = document.querySelectorAll('.ck-editor__editable');
        editors.forEach(el => {
            if (el.ckeditorInstance && !this.registeredEditors.has(el.ckeditorInstance)) {
                this.registerAnnotationPlugin(el.ckeditorInstance);
                this.registeredEditors.add(el.ckeditorInstance);
            }
        });
    }

    getButtonViewClass(editor) {
        // 尝试多种方式获取 ButtonView 类
        try {
            // 方法 1: 从现有按钮获取构造函数
            const componentFactory = editor.ui.componentFactory;

            // 尝试创建一个已知的按钮来获取 ButtonView 类
            const knownButtons = ['bold', 'italic', 'link', 'undo'];

            for (const buttonName of knownButtons) {
                try {
                    if (componentFactory.has(buttonName)) {
                        const tempButton = componentFactory.create(buttonName);
                        if (tempButton && tempButton.constructor) {
                            console.log('[批注插件] 从', buttonName, '按钮获取了 ButtonView 类');
                            return tempButton.constructor;
                        }
                    }
                } catch (e) {
                    // 继续尝试下一个
                }
            }

            // 方法 2: 从全局对象获取
            if (window.CKEditor5 && window.CKEditor5.ui && window.CKEditor5.ui.ButtonView) {
                console.log('[批注插件] 从全局 CKEditor5 对象获取 ButtonView');
                return window.CKEditor5.ui.ButtonView;
            }

            // 方法 3: 从编辑器对象获取
            if (editor.ui && editor.ui.ButtonView) {
                console.log('[批注插件] 从 editor.ui 获取 ButtonView');
                return editor.ui.ButtonView;
            }

            console.error('[批注插件] 无法获取 ButtonView 类');
            return null;

        } catch (error) {
            console.error('[批注插件] 获取 ButtonView 类时出错:', error);
            return null;
        }
    }

    registerAnnotationPlugin(editor) {
        try {
            const componentFactory = editor.ui.componentFactory;

            // 检查是否已注册
            try {
                if (componentFactory._components && componentFactory._components.has &&
                    componentFactory._components.has('annotation')) {
                    console.log('[批注插件] 按钮已注册，跳过注册步骤');
                    this.addToBalloonToolbar(editor);
                    return;
                }
            } catch (e) {
                // 忽略检查错误，继续注册
            }

            // 获取 ButtonView 类
            const ButtonView = this.getButtonViewClass(editor);

            if (!ButtonView) {
                console.error('[批注插件] 无法找到 ButtonView 类，使用降级方案');
                this.fallbackToDOM(editor);
                return;
            }

            // 注册 UI 组件到 componentFactory
            componentFactory.add('annotation', (locale) => {
                const view = new ButtonView(locale);

                view.set({
                    label: '添加批注',
                    icon: this.getAnnotationIcon(),
                    tooltip: true,
                    withText: false
                });

                // 绑定到编辑器只读状态
                try {
                    view.bind('isEnabled').to(
                        editor,
                        'isReadOnly',
                        isReadOnly => !isReadOnly
                    );
                } catch (e) {
                    view.isEnabled = true;
                }

                // 点击时执行批注功能
                view.on('execute', () => {
                    this.handleAddAnnotation(editor);
                });

                return view;
            });

            // 添加到浮动工具栏和固定工具栏
            this.addToBalloonToolbar(editor);
            this.addToClassicToolbar(editor);

            console.log('[批注插件] 已为编辑器注册批注功能');
        } catch (error) {
            console.error('[批注插件] 注册失败:', error);
            this.fallbackToDOM(editor);
        }
    }

    addToBalloonToolbar(editor) {
        try {
            // 检查是否有 BalloonToolbar 插件
            if (!editor.plugins || !editor.plugins.has('BalloonToolbar')) {
                console.log('[批注插件] 未找到 BalloonToolbar 插件，可能是固定工具栏模式');
                return;
            }

            const balloonToolbar = editor.plugins.get('BalloonToolbar');

            if (!balloonToolbar.toolbarView || !balloonToolbar.toolbarView.items) {
                console.log('[批注插件] BalloonToolbar 没有 toolbarView.items');
                return;
            }

            const items = balloonToolbar.toolbarView.items;

            // 检查是否已添加
            let hasAnnotation = false;
            items.forEach(item => {
                const label = item.label || item.buttonView?.label || '';
                if (label === '添加批注') {
                    hasAnnotation = true;
                }
            });

            if (hasAnnotation) {
                console.log('[批注插件] 批注按钮已在浮动工具栏中');
                return;
            }

            // 创建按钮
            const componentFactory = editor.ui.componentFactory;
            if (!componentFactory.has('annotation')) {
                console.warn('[批注插件] annotation 组件未注册');
                return;
            }

            const button = componentFactory.create('annotation');

            if (!button) {
                console.warn('[批注插件] 无法创建 annotation 按钮');
                return;
            }

            // 找到 link 按钮的位置
            let insertIndex = -1;
            items.forEach((item, index) => {
                const label = item.label || item.buttonView?.label || '';
                if (label && (label.toLowerCase().includes('link') || label.includes('链接'))) {
                    insertIndex = index + 1;
                }
            });

            // 添加按钮
            if (insertIndex > 0 && insertIndex <= items.length) {
                items.add(button, insertIndex);
                console.log('[批注插件] ✓ 批注按钮已添加到浮动工具栏（位置：', insertIndex, '）');
            } else {
                items.add(button);
                console.log('[批注插件] ✓ 批注按钮已添加到浮动工具栏（末尾）');
            }

        } catch (error) {
            console.error('[批注插件] 添加到浮动工具栏失败:', error);
            console.error('[批注插件] 错误详情:', error.stack);
        }
    }

    addToClassicToolbar(editor) {
        setTimeout(() => {
            try {
                const toolbar = document.querySelector('.classic-toolbar-widget:not(.hidden-ext) .ck-toolbar__items');

                if (!toolbar) {
                    return;
                }

                if (toolbar.querySelector('.annotation-button') ||
                    toolbar.querySelector('[data-cke-tooltip-text*="批注"]')) {
                    return;
                }

                this.injectButtonToDOM(toolbar, editor);
                console.log('[批注插件] ✓ 批注按钮已添加到固定工具栏');

            } catch (error) {
                console.warn('[批注插件] 添加到固定工具栏失败:', error);
            }
        }, 500);
    }

    fallbackToDOM(editor) {
        console.log('[批注插件] 使用 DOM 注入降级方案');
        setTimeout(() => {
            const toolbars = [
                document.querySelector('.classic-toolbar-widget:not(.hidden-ext) .ck-toolbar__items'),
                document.querySelector('.ck-toolbar__items')
            ];

            for (const toolbar of toolbars) {
                if (toolbar && !toolbar.querySelector('.annotation-button')) {
                    this.injectButtonToDOM(toolbar, editor);
                    console.log('[批注插件] ✓ 已通过 DOM 注入添加按钮');
                    break;
                }
            }
        }, 500);
    }

    injectButtonToDOM(toolbar, editor) {
        try {
            const item = document.createElement('div');
            item.className = 'ck ck-toolbar__item';

            const button = document.createElement('button');
            button.className = 'annotation-button annotation-toolbar-btn ck ck-button';
            button.type = 'button';
            button.title = '添加批注 (选中文字后点击)';
            button.setAttribute('data-cke-tooltip-text', '添加批注');
            button.style.cssText = 'background: transparent; border: 0; cursor: pointer; padding: 0.4em; margin: 0; display: flex; align-items: center;';
            button.innerHTML = this.getAnnotationIcon();

            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleAddAnnotation(editor);
            });

            item.appendChild(button);

            const linkButton = toolbar.querySelector('.ck-link-ui, .ck-button[data-cke-tooltip-text*="Link"]');
            if (linkButton && linkButton.parentElement) {
                linkButton.parentElement.insertAdjacentElement('afterend', item);
            } else {
                toolbar.appendChild(item);
            }

        } catch (e) {
            console.error('[批注插件] DOM 注入失败:', e);
        }
    }

    getAnnotationIcon() {
        return `<svg class="ck ck-icon ck-button__icon" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; fill: currentColor;">
            <path d="M18 2H2c-.6 0-1 .4-1 1v14c0 .6.4 1 1 1h16c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1zM3 4h14v3H3V4zm0 5h14v2H3V9zm0 4h9v2H3v-2z"/>
        </svg>`;
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
            const encodedText = encodeURIComponent(annotationText);
            const linkUrl = `#${annotationId}?text=${encodedText}`;

            await new Promise(resolve => setTimeout(resolve, 150));

            editor.model.change(writer => {
                try {
                    const root = editor.model.document.getRoot();
                    const start = writer.createPositionFromPath(root, startPath);
                    const end = writer.createPositionFromPath(root, endPath);
                    const newRange = writer.createRange(start, end);

                    writer.setAttribute('linkHref', linkUrl, newRange);
                } catch (e) {
                    console.error('[批注插件] 添加属性时出错:', e);
                    throw e;
                }
            });

            setTimeout(() => {
                this.rebindExistingAnnotations();
            }, 300);

            this.showNotification('批注添加成功！', 'success');

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

            let annotationText = '';

            if (href.includes('?text=')) {
                const urlParts = href.split('?text=');
                if (urlParts.length > 1) {
                    annotationText = decodeURIComponent(urlParts[1]);
                }
            }

            if (!annotationText) {
                this.showNotification('未找到批注内容', 'warning');
                return;
            }

            const newText = await this.showInputDialog('批注内容（留空删除批注）：', annotationText);

            if (newText === null) {
                return;
            }

            if (newText.trim() === '') {
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
        if (typeof api !== 'undefined' && api.showMessage) {
            api.showMessage(message);
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
