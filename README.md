# KK Markdown Live

在 VS Code / Cursor 中右键 Markdown 文件，用 Chrome 打开实时预览。编辑保存后浏览器自动刷新，适合查看需求文档。

## 功能

- Editor / Explorer / title bar: **Preview Markdown in Chrome**
- 编辑时防抖刷新（默认 300ms），保存立即推送
- **代码块语法高亮**（highlight.js，支持 js/ts/py/go/rust/bash/json/yaml/sql 等）
- **Mermaid 图表**（` ```mermaid ` 代码块）
- 本地图片相对路径自动解析
- **左侧目录**：自动提取 h1–h6 标题，点击跳转，滚动高亮当前章节
- **自动回收**：关闭全部预览标签后，HTTP 服务自动停止，释放内存
- 浅色/深色跟随系统
- **导出 PDF**：预览页右上角一键下载（仅正文，浅色排版）
- 端口占用自动递增

## 安装

### 开发调试（推荐）

```bash
cd kk-markdown-live
npm install
npm run compile
```

1. 用 VS Code / Cursor 打开本目录
2. 按 `F5` 启动 **Run Extension**（会打开 Extension Development Host 窗口）
3. Extension Host 里打开任意 `.md` → right-click → **Preview Markdown in Chrome**

### 打包安装

```bash
npm install
npm run package    # 生成 kk-markdown-live-0.5.1.vsix
```

Cursor / VS Code：**Extensions → ... → Install from VSIX**，选择生成的 `.vsix`。

## 使用

| 入口                        | 操作                                           |
| --------------------------- | ---------------------------------------------- |
| Editor context menu         | Preview Markdown in Chrome                     |
| Explorer `.md` context menu | Same                                           |
| Command Palette             | `KK Markdown Live: Preview Markdown in Chrome` |

预览页顶部绿点表示 WebSocket 已连接；修改文档后内容自动更新。右上角 **导出 PDF** 可直接下载（仅正文，始终浅色）。

代码高亮与 Mermaid（` ```mermaid `）随推送重绘。详细需求与验收见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)；历史设计见 [docs/HISTORY.md](docs/HISTORY.md)。

## 配置

| 键                            | 默认            | 说明                      |
| ----------------------------- | --------------- | ------------------------- |
| `kk-markdown-live.port`       | `19527`         | HTTP 预览端口             |
| `kk-markdown-live.browser`    | `Google Chrome` | macOS `open -a` 浏览器名  |
| `kk-markdown-live.debounceMs` | `300`           | 输入时刷新防抖            |
| `kk-markdown-live.theme`      | `auto`          | `auto` / `light` / `dark` |

预览页 **主题** 按钮循环：跟随系统 → 浅色 → 深色（localStorage）。

## 技术说明

- 本地 `127.0.0.1` HTTP + WebSocket；`marked` + highlight.js + mermaid；PDF 用本机 Chrome printToPDF
- macOS：`open -a "Google Chrome"`；Windows 尝试 Chrome 路径；其它回退系统浏览器

## License

MIT
