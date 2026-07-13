# KK Markdown Live

在 VS Code / Cursor 中右键 Markdown 文件，用 Chrome 打开实时预览。编辑保存后浏览器自动刷新，适合查看需求文档。

## 功能

- 编辑器右键、资源管理器右键、标题栏按钮：**在 Chrome 中预览 Markdown**
- 编辑时防抖刷新（默认 300ms），保存立即推送
- **代码块语法高亮**（highlight.js，支持 js/ts/py/go/rust/bash/json/yaml/sql 等）
- **Mermaid 图表**（` ```mermaid ` 代码块）
- 本地图片相对路径自动解析
- **左侧目录**：自动提取 h1–h6 标题，点击跳转，滚动高亮当前章节
- 浅色/深色跟随系统
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
3. 在新窗口打开任意 `.md` 文件 → 右键 → **在 Chrome 中预览 Markdown**

### 打包安装

```bash
npm install
npm run package    # 生成 kk-markdown-live-0.1.0.vsix
```

Cursor / VS Code：**Extensions → ... → Install from VSIX**，选择生成的 `.vsix`。

## 使用

| 入口 | 操作 |
|------|------|
| 编辑器右键 | 在 Chrome 中预览 Markdown |
| 资源管理器 `.md` 右键 | 同上 |
| 命令面板 | `KK Markdown Live: 在 Chrome 中预览 Markdown` |

预览页顶部绿点表示 WebSocket 已连接；修改文档后内容自动更新。

### 代码高亮

支持常见语言：`javascript` / `typescript` / `python` / `go` / `rust` / `bash` / `json` / `yaml` / `sql` 等。

````markdown
```python
def hello():
    print("world")
```
````

### Mermaid 图表

````markdown
```mermaid
graph LR
  A[需求] --> B[开发]
  B --> C[上线]
```
````

编辑后图表会随 WebSocket 推送自动重绘。

## 配置

| 键 | 默认 | 说明 |
|----|------|------|
| `kk-markdown-live.port` | `19527` | HTTP 预览端口 |
| `kk-markdown-live.browser` | `Google Chrome` | macOS `open -a` 浏览器名 |
| `kk-markdown-live.debounceMs` | `300` | 输入时刷新防抖 |
| `kk-markdown-live.theme` | `auto` | 默认主题：`auto` / `light` / `dark` |

预览页右上角 **主题** 按钮可循环切换：跟随系统 → 浅色 → 深色；选择保存在浏览器 localStorage。

## 技术说明

- 本地 `127.0.0.1` HTTP 服务 + WebSocket 推送 HTML 片段
- `marked` 渲染 Markdown
- macOS 用 `open -a "Google Chrome"`；Windows 尝试 Chrome 路径；其他平台回退系统浏览器

## License

MIT
