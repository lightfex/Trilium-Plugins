# Trilium 插件集合

这是一个为 [Trilium Notes](https://github.com/zadam/trilium) 开发的插件集合仓库，提供各种增强功能。

![Trilium](https://img.shields.io/badge/Trilium-0.100.0+-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## 📦 插件列表

### 1. 批注插件 (Annotation Plugin)

为文本添加批注功能，支持固定工具栏和浮动工具栏。

- **文件**: `trilium-annotation-plugin.js`
- **版本**: v3.5
- **功能**:
  - ✅ 选中文字添加批注
  - ✅ 批注编辑与删除
  - ✅ 多行输入支持
  - ✅ 视觉高亮显示
  - ✅ 双工具栏模式支持

[📖 查看详细文档](./docs/annotation-plugin.md)

---

### 更多插件开发中...

## 🚀 通用安装方法

所有插件的安装方法相同：

1. **在 Trilium 中创建新笔记**
   - 笔记类型：**Code (JavaScript)**
   - 标题：插件名称（如"批注插件"）

2. **复制插件代码**
   - 将对应的 `.js` 文件内容复制到笔记中

3. **设置启动标签**
   - 为笔记添加标签：`#run=frontendStartup`

4. **刷新应用**
   - 按 `F5` 刷新页面
   - 或重启 Trilium

5. **验证安装**
   - 打开浏览器控制台（F12）
   - 查看是否有相应的初始化日志

## 📁 仓库结构

```
Trilium-Plugins/
├── trilium-annotation-plugin.js   # 批注插件
├── docs/                           # 文档目录
│   └── annotation-plugin.md        # 批注插件详细文档
├── README.md                       # 本文件（仓库总览）
└── （未来会添加更多插件）
```

## ⚙️ 兼容性

- **Trilium 版本**: v0.100.0 及以上
- **编辑器**: CKEditor 5
- **浏览器**: Chrome、Firefox、Edge、Safari 等现代浏览器

## 🐛 故障排除

### 插件未加载

**检查清单**：
1. ✅ 笔记类型是否为 **Code (JavaScript)**
2. ✅ 是否添加了标签 `#run=frontendStartup`
3. ✅ 是否刷新了页面（F5）
4. ✅ 查看控制台是否有错误信息

### 查看日志

打开浏览器控制台（F12），查看插件初始化日志：
- 成功加载会显示 `[插件名] 初始化完成`
- 如有错误会显示具体错误信息

## 🤝 贡献

欢迎贡献新的插件或改进现有插件！

**贡献方式**：
1. Fork 本仓库
2. 创建新的插件文件
3. 在 `docs/` 目录下添加插件文档
4. 更新本 README 的插件列表
5. 提交 Pull Request

**插件开发规范**：
- 使用 `frontendStartup` 钩子
- 添加详细的控制台日志
- 提供完整的使用文档
- 遵循 Trilium 的 API 规范

## 📝 开发计划

未来计划开发的插件（欢迎建议）：

- [ ] 待添加...

## 📄 许可证

本仓库所有插件均为开源项目，采用 MIT 许可证，可自由使用和修改。

## 🙏 致谢

- [Trilium Notes](https://github.com/zadam/trilium) - 强大的笔记应用
- [CKEditor 5](https://ckeditor.com/) - 优秀的富文本编辑器
- 所有贡献者和用户

---

**最后更新**: 2025-12-24
