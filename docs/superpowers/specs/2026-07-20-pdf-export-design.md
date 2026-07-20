# PDF 导出 — Design Spec

**Date:** 2026-07-20  
**Status:** Approved (user chose approach 1; §1–3 approved; proceed to implement)

## Goal

Chrome 预览页右上角提供「导出 PDF」：点击后直接下载 `.pdf`（不走打印对话框）。

## Requirements

| ID | Requirement |
|----|-------------|
| FR-PDF-01 | Header `.actions` 有「导出 PDF」按钮（主题按钮左侧） |
| FR-PDF-02 | 点击后浏览器下载 `{文档名}.pdf` |
| FR-PDF-03 | PDF 内容 = 目录 + 正文；不含顶栏/实时状态 |
| FR-PDF-04 | PDF 始终浅色，不改变当前预览主题 |
| FR-PDF-05 | 导出中按钮 disabled +「导出中…」；失败 alert 并恢复 |
| FR-PDF-06 | 离线可用：`html2pdf` 作为本地 vendor |

## Non-goals

- 服务端 / Puppeteer 生成
- 完美多分页裁切修复
- 导出主题选择 UI

## Approach

Client-side `html2pdf.js`（bundled under `media/`，经 `/vendor/` 提供），克隆 TOC + content 到离屏浅色容器后 `save()`。

## Known limits

html2canvas 对超长文档分页可能裁切 — 可接受；升级路径为 Puppeteer。
