# KK Markdown Live — 需求历史归档

> 从 `REQUIREMENTS.md` 近窗截出或迁入的旧设计/计划，**不改产品行为**。
> Agent：**修旧行为 / 查版本原因 / 复现历史验收** 时再读本文。日常实现只读 `REQUIREMENTS.md`。

## 开发进度记录（近窗之前）

### 2026-07-20 — PDF 导出（v0.5.0）

- **目标**：Chrome 预览页右上角「导出 PDF」，点击直接下载 `.pdf`（不走打印对话框）。
- **采纳方案**：客户端 `html2pdf.js`（bundled under `media/`，经 `/vendor/` 提供）；克隆 TOC + content 到离屏浅色容器后 `save()`。
- **明确不做**：服务端 / Puppeteer 生成；完美多分页裁切；导出主题选择 UI。
- **已知上限**：html2canvas 对超长文档分页可能裁切 — 可接受；升级路径 Puppeteer。
- **实现任务（已完成）**：
  1. Vendor：`html2pdf.js` → `media/`，`/vendor/html2pdf.bundle.min.js`
  2. UI + `exportPdf()`：loading/error、浅色离屏克隆
  3. 文档：README + `REQUIREMENTS.md` FR-PDF-*
- **验证（当时）**：`npm run compile`；vendor 文件存在；手动冒烟导出。

### 设计摘要（原 `docs/superpowers/specs/2026-07-20-pdf-export-design.md`）

| ID                    | Requirement                                      |
| --------------------- | ------------------------------------------------ |
| FR-PDF-01             | Header `.actions` 有「导出 PDF」（主题按钮左侧） |
| FR-PDF-02             | 下载 `{文档名}.pdf`                              |
| FR-PDF-03             | PDF = 目录 + 正文；不含顶栏                      |
| FR-PDF-04             | PDF 始终浅色，不改变预览主题                     |
| FR-PDF-05（当时编号） | 导出中 disabled +「导出中…」；失败 alert         |
| FR-PDF-06（当时编号） | 离线：`html2pdf` 本地 vendor                     |

> 现行编号见 `REQUIREMENTS.md`：加载/失败为 FR-PDF-04，离线 vendor 为 FR-PDF-05。
