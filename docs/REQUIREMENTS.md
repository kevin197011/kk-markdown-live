# KK Markdown Live — 需求文档

## 背景与目标

在 VS Code / Cursor 中右键 Markdown，用浏览器实时预览需求文档；编辑即刷新。

**非目标：** 不做成完整文档站点；不做多人协作编辑。

## 用户与权限

单机本地预览（`127.0.0.1`），无账号体系。

## 功能需求

| ID | 需求 | 验收标准 |
|----|------|----------|
| FR-PREV-01 | 编辑器/资源管理器/标题栏打开 Chrome 预览 | 命令可打开浏览器预览页 |
| FR-PREV-02 | 编辑防抖刷新 + 保存立即推送 | 改文档后预览内容更新 |
| FR-PREV-03 | 代码高亮 + Mermaid | 对应代码块正确渲染 |
| FR-PREV-04 | 左侧目录 + 滚动高亮 | 有标题时显示 TOC，点击跳转 |
| FR-PREV-05 | 浅色/深色主题 | 按钮循环 auto/light/dark，localStorage 记住 |
| FR-PDF-01 | 右上角「导出 PDF」 | 按钮在主题左侧 |
| FR-PDF-02 | 直接下载 PDF | 无打印对话框；文件名 `{文档名}.pdf` |
| FR-PDF-03 | PDF = 目录 + 正文，浅色 | 不含顶栏；预览主题不变 |
| FR-PDF-04 | 导出中态与失败提示 | disabled +「导出中…」；失败 alert |

## 非功能需求

- 本地 vendor，离线可用
- 端口占用自动递增
- 关闭全部预览后回收 HTTP 服务

## 架构概览

VS Code 扩展 → 本地 HTTP + WebSocket → Chrome 预览页（marked / highlight.js / mermaid / html2pdf.js）

## 数据模型

无持久化业务数据；主题仅存浏览器 `localStorage`。

## API 摘要

| 路径 | 说明 |
|------|------|
| `/preview/:sid/...` | 预览 HTML |
| `/ws/:sid` | WebSocket 推送更新 |
| `/vendor/*` | mermaid / html2pdf 静态脚本 |
| `/asset?path=` | 本地图片 |

## 部署与运维

见 README：`npm install` → `compile` / `package`。配置项：`port` / `browser` / `debounceMs` / `theme`。

## 安全与已知风险

- `/asset` 读本地文件路径，仅绑定本机
- PDF 导出依赖 html2canvas，超长文档分页可能裁切

## 测试验收清单

1. F5 跑扩展 → 打开 `.md` → Chrome 预览
2. 右上角「导出 PDF」→ 下载浅色 PDF，含目录+正文
3. 主题切换不影响下次导出仍为浅色 PDF

## 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 0.4.2 | — | 既有预览功能 |
| 0.5.0 | 2026-07-20 | 新增 PDF 导出（FR-PDF-*） |
