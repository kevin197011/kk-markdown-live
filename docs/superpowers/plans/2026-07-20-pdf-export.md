# PDF Export Implementation Plan

> **For agentic workers:** Inline execution in this session (user: 继续开发).

**Goal:** Preview page top-right 「导出 PDF」 downloads light-themed PDF with TOC + body.

**Architecture:** Vendor `html2pdf.bundle.min.js` like mermaid; client clones `#toc` + `#content` into offscreen light container; `html2pdf().save()`.

**Tech Stack:** html2pdf.js 0.14.x, existing preview HTTP `/vendor/` route.

## Global Constraints

- No print dialog
- Always light PDF theme
- No new abstraction beyond matching existing vendor pattern
- Do not commit unless user asks

---

### Task 1: Vendor dependency

**Files:**
- Modify: `package.json`
- Modify: `scripts/copy-vendor.js`
- Modify: `src/preview.ts` (vendor route)

- [ ] Install `html2pdf.js`
- [ ] Copy `dist/html2pdf.bundle.min.js` → `media/`
- [ ] Serve `/vendor/html2pdf.bundle.min.js`

### Task 2: UI + export logic

**Files:**
- Modify: `src/preview.ts`

- [ ] Add `.header-btn` shared style; PDF button + script tag
- [ ] Implement `exportPdf()`: offscreen light clone TOC+content, wait fonts/images, save, cleanup
- [ ] Wire click + loading/error states

### Task 3: Docs

**Files:**
- Modify: `README.md`
- Create/Update: `docs/REQUIREMENTS.md`

- [ ] Document feature + FR-PDF-*
- [ ] `npm run compile` + smoke check vendor file exists
