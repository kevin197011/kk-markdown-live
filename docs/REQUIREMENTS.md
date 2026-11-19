# KK Markdown Live — 需求文档

> 产品行为权威。近窗之前的设计/进度见 [`HISTORY.md`](HISTORY.md)。

## 1. 背景与目标

在 VS Code / Cursor 中右键 Markdown，用浏览器实时预览需求文档；编辑即刷新。

**非目标：** 不做成完整文档站点；不做多人协作编辑；不接云端 PDF 服务（本机 Chrome print-to-PDF 除外）。

## 2. 用户与权限

单机本地预览（`127.0.0.1`），无账号体系。

## 3. 功能需求

| ID         | 需求                                   | 验收标准                                                         |
| ---------- | -------------------------------------- | ---------------------------------------------------------------- |
| FR-PREV-01 | 编辑器/资源管理器/标题栏打开浏览器预览 | 命令标题为英文 `Preview Markdown in Chrome`；可打开预览页        |
| FR-PREV-02 | 编辑防抖刷新 + 保存立即推送            | 改文档后预览内容更新                                             |
| FR-PREV-03 | 代码高亮 + Mermaid                     | 对应代码块正确渲染                                               |
| FR-PREV-04 | 左侧目录 + 滚动高亮                    | 有标题时显示 TOC，点击跳转                                       |
| FR-PREV-05 | 浅色/深色主题                          | 按钮循环 auto/light/dark，localStorage 记住                      |
| FR-PDF-01  | 右上角「导出 PDF」                     | 按钮在主题左侧                                                   |
| FR-PDF-02  | 直接下载 PDF                           | 无打印对话框；文件名 `{文档名}.pdf`                              |
| FR-PDF-03  | PDF = 仅正文，浅色                     | 不含顶栏与目录；预览主题不变；长文档正文完整                     |
| FR-PDF-04  | 导出中态与失败提示                     | disabled +「导出中…」；失败 alert                                |
| FR-PDF-05  | 本机 Chrome 矢量导出                   | `/export-pdf/:sid` 调本机 Chrome `Page.printToPDF`；无打印对话框 |

## 4. 非功能需求

- 本地 vendor（mermaid）；PDF 依赖本机 Chrome/Chromium
- 端口占用自动递增
- 关闭全部预览后回收 HTTP 服务

## 5. 架构概览

```
VS Code 扩展 → 本地 HTTP + WebSocket → 浏览器预览页
               (marked / highlight.js / mermaid；PDF = Chrome printToPDF)
```

## 6. 数据模型

无持久化业务数据；主题仅存浏览器 `localStorage`。

## 7. API 摘要

| 路径                | 说明                 |
| ------------------- | -------------------- |
| `/preview/:sid/...` | 预览 HTML            |
| `/ws/:sid`          | WebSocket 推送更新   |
| `/vendor/*`         | mermaid 静态脚本     |
| `/print/:sid`       | 仅正文打印页（浅色） |
| `/export-pdf/:sid`  | 生成并下载 PDF       |
| `/asset?path=`      | 本地图片             |

## 8. 部署与运维

见 README：`npm install` → `compile` / `package`。

| 配置键                        | 默认            | 说明                      |
| ----------------------------- | --------------- | ------------------------- |
| `kk-markdown-live.port`       | `19527`         | HTTP 预览端口             |
| `kk-markdown-live.browser`    | `Google Chrome` | macOS `open -a` 浏览器名  |
| `kk-markdown-live.debounceMs` | `300`           | 输入刷新防抖              |
| `kk-markdown-live.theme`      | `auto`          | `auto` / `light` / `dark` |

## 9. 安全与已知风险

- `/asset` 读本地文件路径，仅绑定本机
- PDF 经本机 Chrome 矢量打印；需本机装有 Chrome/Chromium（与预览浏览器一致）

## 10. 测试验收清单

1. F5 跑扩展 → 打开 `.md` → 浏览器预览
2. 编辑 / 保存 → 预览自动更新
3. 右上角「导出 PDF」→ 下载浅色 PDF（仅正文，无目录）
4. 主题切换不影响下次导出仍为浅色 PDF
5. 断网仍可打开预览与导出（vendor 本地）

## 11. 变更记录

| 版本  | 日期       | 说明                                       |
| ----- | ---------- | ------------------------------------------ |
| 0.5.1 | 2026-11-19 | PDF 改为 Chrome printToPDF（矢量）；仅正文 |
| 0.5.0 | 2026-07-20 | 新增 PDF 导出（FR-PDF-*）                  |
| 0.4.2 | —          | 既有预览功能                               |

更早设计草案与实现计划已迁入 [`HISTORY.md`](HISTORY.md)。

## 开发进度记录

### 2026-11-19（Rakefile / push.rb）

- 补齐 `Rakefile` + `push.rb`（kk-git）。无 Compose → 不写 `deploy.sh`。
- `rake run`：`npm package` + 安装 VSIX 到 Cursor/VS Code；`rake push` → `git:auto_commit_push`。
- **验证**：`rake -T` 列出 `run` / `push`。

### 2026-11-19（E2E + Chrome 矢量 PDF）

- **E2E**：`scripts/e2e-pdf-export.js` 拉起真实 `PreviewServer`，导出 `REQUIREMENTS.md`。
- **观察（旧 html2pdf）**：5 页、位图发糊、首页「3. 功能需求」孤行大块留白。
- **修复**：改为本机 Chrome `Page.printToPDF`（`/print/:sid` + `/export-pdf/:sid`）；正文 only；矢量字。
- **复测**：同脚本 → 3 页、表格接在标题下、文件约 662KB；页图人工核对通过。
- **验证**：`npm run compile`；`node scripts/e2e-pdf-export.js`；安装 `0.5.1` VSIX。

### 2026-11-19（PDF 仅正文）

- **决策**：导出 PDF 不再含目录侧栏；只导出 markdown 正文。预览页 TOC 保留。
- **原因**：目录占宽导致长文显示不全；用户明确只要正文。
- **验证**：`npm run compile`；`node scripts/check-pdf-fullbody.js`；重装 VSIX 后手动导出。

### 2026-11-19（PDF 正文不全 + 命令英文）

- **问题**：浏览器「导出 PDF」长文档正文显示不全。
- **根因**：`pagebreak: avoid-all` 与 float 侧栏布局在 html2pdf/html2canvas 下裁切内容。
- **修复**：`#pdf-export-root` 改为 flex；`pagebreak` 改为 `['css','legacy']`；html2canvas 使用 `scrollWidth/scrollHeight`；代码块/表/图 `break-inside: avoid`。
- **UI**：VS Code 命令/描述改为英文 `Preview Markdown in Chrome`（及 New Window）；扩展提示同步英文。
- **验证**：`npm run compile`；`node scripts/check-pdf-capture.js`；`node scripts/check-pdf-fullbody.js`（6565px / 7 页）；手动：长 `.md` 导出应见末尾章节。
- **遗留**：单元素跨页时 html2canvas 仍可能切边；未换 Puppeteer。

### 2026-11-19

- **文档规范整理**：按 `project-documentation` / `dev-progress-log` 对齐。
  - `REQUIREMENTS.md` 补齐章节编号、FR-PDF-05（离线 vendor）、开发进度近窗。
  - 新建 `HISTORY.md`，归档 `docs/superpowers/` 下 PDF 设计与实现计划后删除该目录。
  - README 修正 VSIX 版本注释；配置表保留在 README，需求权威仍在本文。
- **决策**：VS Code 扩展无 Compose，不补 `Rakefile` / `deploy.sh`。
- **验证**：对照 `src/` / `media/` 确认 FR-PREV-* / FR-PDF-* 与现码一致；未改运行时代码。
- **遗留**：无自动化扩展 E2E；验收仍靠 F5 手动冒烟。
