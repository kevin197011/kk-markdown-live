import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { marked, Renderer } from 'marked';
import { WebSocket, WebSocketServer } from 'ws';
import { highlightCode } from './highlight';
import { HLJS_CSS } from './styles';

export interface PreviewSession {
  filePath: string;
  clients: Set<WebSocket>;
}

function sessionId(filePath: string): string {
  return crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 12);
}

function filePathInUrl(filePath: string): string {
  const normalized = path.normalize(filePath);
  const segments = normalized.split(path.sep).filter(Boolean).map(encodeURIComponent);
  return segments.join('/');
}

function parsePreviewRoute(pathname: string): { sid: string; filePathHint?: string } | null {
  const match = pathname.match(/^\/preview\/([a-f0-9]{12})(?:\/(.*))?$/);
  if (!match) {
    return null;
  }
  const sid = match[1];
  const rest = match[2];
  if (!rest) {
    return { sid };
  }
  const filePathHint = rest
    .split('/')
    .map((seg) => decodeURIComponent(seg))
    .join(path.sep);
  const absolute = path.isAbsolute(filePathHint) ? filePathHint : path.join(path.sep, filePathHint);
  return { sid, filePathHint: absolute };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function makeSlugger() {
  const counts = new Map<string, number>();
  return (text: string): string => {
    const plain = stripHtml(text);
    let base = plain
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\s-]/gi, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!base) {
      base = 'section';
    }
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    return n > 0 ? `${base}-${n}` : base;
  };
}

function buildRenderer(mdFile: string): Renderer {
  const slugger = makeSlugger();
  const renderer = new Renderer();
  renderer.heading = (text: string, level: number) => {
    const id = slugger(text);
    return `<h${level} id="${escapeHtml(id)}">${text}</h${level}>\n`;
  };
  renderer.image = (href: string, title: string | null, text: string) => {
    if (!href) {
      return '';
    }
    if (/^https?:\/\//i.test(href) || href.startsWith('data:')) {
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${href}" alt="${escapeHtml(text)}"${t}>`;
    }
    const abs = path.resolve(path.dirname(mdFile), href);
    const url = `/asset?path=${encodeURIComponent(abs)}`;
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img src="${url}" alt="${escapeHtml(text)}"${t}>`;
  };
  renderer.code = (code: string, infostring: string | undefined) => {
    const lang = (infostring || '').trim().toLowerCase();
    if (lang === 'mermaid') {
      return `<div class="mermaid">${escapeHtml(code)}</div>\n`;
    }
    const { html, language } = highlightCode(code, lang || undefined);
    return `<pre><code class="hljs language-${escapeHtml(language)}">${html}</code></pre>\n`;
  };
  return renderer;
}

export function renderMarkdown(mdFile: string, source: string): string {
  const renderer = buildRenderer(mdFile);
  return marked.parse(source, { async: false, renderer }) as string;
}

const THEME_VARS = `
  html[data-theme="light"] {
    color-scheme: light;
    --bg: #fafafa;
    --fg: #1a1a1a;
    --muted: #666;
    --border: #e5e5e5;
    --code-bg: #f4f4f5;
    --link: #0969da;
    --blockquote: #57606a;
    --btn-bg: #fff;
    --btn-fg: #1a1a1a;
    --btn-border: #d0d7de;
  }
  html[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0d1117;
    --fg: #e6edf3;
    --muted: #8b949e;
    --border: #30363d;
    --code-bg: #161b22;
    --link: #58a6ff;
    --blockquote: #8b949e;
    --btn-bg: #21262d;
    --btn-fg: #e6edf3;
    --btn-border: #30363d;
  }
  html[data-theme="auto"] { color-scheme: light dark; }
  @media (prefers-color-scheme: light) {
    html[data-theme="auto"] {
      --bg: #fafafa;
      --fg: #1a1a1a;
      --muted: #666;
      --border: #e5e5e5;
      --code-bg: #f4f4f5;
      --link: #0969da;
      --blockquote: #57606a;
      --btn-bg: #fff;
      --btn-fg: #1a1a1a;
      --btn-border: #d0d7de;
    }
  }
  @media (prefers-color-scheme: dark) {
    html[data-theme="auto"] {
      --bg: #0d1117;
      --fg: #e6edf3;
      --muted: #8b949e;
      --border: #30363d;
      --code-bg: #161b22;
      --link: #58a6ff;
      --blockquote: #8b949e;
      --btn-bg: #21262d;
      --btn-fg: #e6edf3;
      --btn-border: #30363d;
    }
  }
`;

const PREVIEW_CSS = `
  ${THEME_VARS}
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: var(--fg);
    background: var(--bg);
  }
  header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 24px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  header .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
  header .filepath {
    display: block;
    font-size: 11px;
    font-weight: 400;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 2px;
  }
  header .title-wrap { flex: 1; min-width: 0; }
  header .actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  header .status { color: var(--muted); white-space: nowrap; }
  header .status.live::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    border-radius: 50%;
    background: #3fb950;
    animation: pulse 2s ease-in-out infinite;
  }
  #theme-toggle {
    cursor: pointer;
    border: 1px solid var(--btn-border);
    background: var(--btn-bg);
    color: var(--btn-fg);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    line-height: 1.4;
    white-space: nowrap;
  }
  #theme-toggle:hover { opacity: 0.85; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
  html { scroll-behavior: smooth; }
  .page {
    display: flex;
    align-items: flex-start;
    min-height: calc(100vh - 49px);
  }
  #toc {
    position: sticky;
    top: 49px;
    flex: 0 0 260px;
    width: 260px;
    max-height: calc(100vh - 49px);
    overflow: auto;
    padding: 20px 12px 32px 16px;
    border-right: 1px solid var(--border);
    background: var(--bg);
    font-size: 13px;
  }
  #toc.empty { display: none; }
  #toc .toc-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin: 0 0 10px 8px;
  }
  #toc-nav { display: flex; flex-direction: column; gap: 2px; }
  #toc-nav a {
    display: block;
    padding: 4px 8px;
    border-radius: 6px;
    color: var(--muted);
    text-decoration: none;
    line-height: 1.4;
    border-left: 2px solid transparent;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #toc-nav a:hover { color: var(--fg); background: var(--code-bg); }
  #toc-nav a.active {
    color: var(--link);
    font-weight: 600;
    border-left-color: var(--link);
    background: var(--code-bg);
  }
  #toc-nav a.toc-h1 { padding-left: 8px; font-weight: 600; color: var(--fg); }
  #toc-nav a.toc-h2 { padding-left: 16px; }
  #toc-nav a.toc-h3 { padding-left: 24px; font-size: 12px; }
  #toc-nav a.toc-h4 { padding-left: 32px; font-size: 12px; }
  #toc-nav a.toc-h5 { padding-left: 40px; font-size: 11px; }
  #toc-nav a.toc-h6 { padding-left: 48px; font-size: 11px; }
  main {
    flex: 1;
    min-width: 0;
    max-width: 900px;
    margin: 0 auto;
    padding: 32px 24px 64px;
  }
  .markdown-body h1, .markdown-body h2, .markdown-body h3,
  .markdown-body h4, .markdown-body h5, .markdown-body h6 {
    scroll-margin-top: 64px;
  }
  @media (max-width: 900px) {
    #toc { display: none; }
    main { max-width: none; }
  }
  .markdown-body h1, .markdown-body h2 { border-bottom: 1px solid var(--border); padding-bottom: .3em; }
  .markdown-body h1 { font-size: 2em; margin-top: 0; }
  .markdown-body h2 { font-size: 1.5em; margin-top: 1.5em; }
  .markdown-body h3 { font-size: 1.25em; margin-top: 1.25em; }
  .markdown-body code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: .9em;
    padding: .2em .4em;
    border-radius: 4px;
    background: var(--code-bg);
  }
  .markdown-body pre {
    overflow: auto;
    padding: 16px;
    border-radius: 8px;
    background: var(--code-bg);
    border: 1px solid var(--border);
    margin: 1em 0;
  }
  .markdown-body pre code { padding: 0; background: none; font-size: .875em; line-height: 1.5; }
  .markdown-body .mermaid {
    margin: 1.5em 0;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--code-bg);
    overflow-x: auto;
    text-align: center;
  }
  ${HLJS_CSS}
  .markdown-body blockquote {
    margin: 0;
    padding: 0 1em;
    color: var(--blockquote);
    border-left: 4px solid var(--border);
  }
  .markdown-body table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  .markdown-body th, .markdown-body td { border: 1px solid var(--border); padding: 8px 12px; }
  .markdown-body th { background: var(--code-bg); }
  .markdown-body a { color: var(--link); text-decoration: none; }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body img { max-width: 100%; height: auto; border-radius: 4px; }
  .markdown-body hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
`;

function previewPageHtml(
  title: string,
  bodyHtml: string,
  wsPath: string,
  defaultTheme: string,
  filePath: string,
): string {
  const safeTheme = ['auto', 'light', 'dark'].includes(defaultTheme) ? defaultTheme : 'auto';
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${safeTheme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(filePath)}</title>
  <style>${PREVIEW_CSS}</style>
</head>
<body>
  <header>
    <div class="title-wrap">
      <span class="title">${escapeHtml(title)}</span>
      <span class="filepath" title="${escapeHtml(filePath)}">${escapeHtml(filePath)}</span>
    </div>
    <div class="actions">
      <button type="button" id="theme-toggle" title="切换浅色 / 深色 / 跟随系统">主题</button>
      <span class="status live" id="status">实时预览</span>
    </div>
  </header>
  <div class="page">
    <aside id="toc" class="empty" aria-label="文档目录">
      <div class="toc-title">目录</div>
      <nav id="toc-nav"></nav>
    </aside>
    <main>
      <article class="markdown-body" id="content">${bodyHtml}</article>
    </main>
  </div>
  <script src="/vendor/mermaid.min.js"></script>
  <script>
    (function () {
      const content = document.getElementById('content');
      const status = document.getElementById('status');
      const themeBtn = document.getElementById('theme-toggle');
      const toc = document.getElementById('toc');
      const tocNav = document.getElementById('toc-nav');
      const STORAGE_KEY = 'kk-markdown-live-theme';
      const serverDefault = '${safeTheme}';
      const themeOrder = ['auto', 'light', 'dark'];
      const themeLabels = { auto: '跟随系统', light: '浅色', dark: '深色' };
      let theme = localStorage.getItem(STORAGE_KEY) || serverDefault;
      if (themeOrder.indexOf(theme) < 0) theme = 'auto';
      let ws;
      let mermaidSources = new WeakMap();
      let tocObserver = null;

      function ensureHeadingIds() {
        let n = 0;
        content.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function (h) {
          if (!h.id) {
            n += 1;
            h.id = 'heading-' + n;
          }
        });
      }

      function buildToc() {
        ensureHeadingIds();
        const headings = content.querySelectorAll('h1,h2,h3,h4,h5,h6');
        tocNav.textContent = '';
        if (!headings.length) {
          toc.classList.add('empty');
          return;
        }
        toc.classList.remove('empty');
        headings.forEach(function (h) {
          const level = parseInt(h.tagName.slice(1), 10);
          const a = document.createElement('a');
          a.href = '#' + h.id;
          a.className = 'toc-item toc-h' + level;
          a.dataset.id = h.id;
          a.textContent = h.textContent || '';
          a.addEventListener('click', function (ev) {
            ev.preventDefault();
            h.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.replaceState(null, '', '#' + h.id);
          });
          tocNav.appendChild(a);
        });
        setupTocSpy();
      }

      function setupTocSpy() {
        if (tocObserver) {
          tocObserver.disconnect();
          tocObserver = null;
        }
        const links = tocNav.querySelectorAll('a');
        if (!links.length) return;
        const byId = {};
        links.forEach(function (a) { byId[a.dataset.id] = a; });
        const headings = Array.from(content.querySelectorAll('h1,h2,h3,h4,h5,h6'));
        tocObserver = new IntersectionObserver(function (entries) {
          const visible = entries.filter(function (e) { return e.isIntersecting; });
          if (!visible.length) return;
          visible.sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
          const id = visible[0].target.id;
          links.forEach(function (a) { a.classList.remove('active'); });
          if (byId[id]) byId[id].classList.add('active');
        }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
        headings.forEach(function (h) { tocObserver.observe(h); });
      }

      function resolvedTheme() {
        if (theme === 'auto') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return theme;
      }

      function updateThemeButton() {
        themeBtn.textContent = themeLabels[theme] || theme;
        themeBtn.title = '当前：' + (themeLabels[theme] || theme) + '（点击切换）';
      }

      function mermaidTheme() {
        return resolvedTheme() === 'dark' ? 'dark' : 'default';
      }

      function initMermaid() {
        if (typeof mermaid === 'undefined') return;
        mermaid.initialize({
          startOnLoad: false,
          theme: mermaidTheme(),
          securityLevel: 'loose',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        });
      }

      function snapshotMermaidSources() {
        content.querySelectorAll('.mermaid').forEach(function (node) {
          if (!mermaidSources.has(node)) {
            mermaidSources.set(node, node.textContent || '');
          }
        });
      }

      function resetMermaidNodes() {
        content.querySelectorAll('.mermaid').forEach(function (node) {
          const src = mermaidSources.get(node);
          if (src != null) {
            node.textContent = src;
            node.removeAttribute('data-processed');
          }
        });
      }

      function renderMermaid() {
        if (typeof mermaid === 'undefined') return Promise.resolve();
        snapshotMermaidSources();
        const nodes = content.querySelectorAll('.mermaid');
        if (!nodes.length) return Promise.resolve();
        mermaid.initialize({ theme: mermaidTheme() });
        return mermaid.run({ nodes: Array.from(nodes), suppressErrors: true }).catch(function () {});
      }

      function applyTheme() {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        updateThemeButton();
        resetMermaidNodes();
        renderMermaid();
      }

      function cycleTheme() {
        theme = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length];
        applyTheme();
      }

      function afterContentUpdate() {
        mermaidSources = new WeakMap();
        buildToc();
        renderMermaid();
      }

      themeBtn.addEventListener('click', cycleTheme);
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (theme === 'auto') applyTheme();
      });

      initMermaid();
      applyTheme();
      buildToc();

      function connect() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(proto + '//' + location.host + '${wsPath}');
        ws.onopen = function () {
          status.textContent = '实时预览';
          status.classList.add('live');
        };
        ws.onmessage = function (ev) {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'update' && typeof msg.html === 'string') {
              content.innerHTML = msg.html;
              afterContentUpdate();
              status.textContent = '已更新 ' + new Date().toLocaleTimeString();
              status.classList.add('live');
            } else if (msg.type === 'reload') {
              location.reload();
            }
          } catch (_) {}
        };
        ws.onclose = function () {
          status.textContent = '连接断开，重连中…';
          status.classList.remove('live');
          setTimeout(connect, 1500);
        };
      }
      connect();
    })();
  </script>
</body>
</html>`;
}

export class PreviewServer {
  private server: http.Server | undefined;
  private wss: WebSocketServer | undefined;
  private sessions = new Map<string, PreviewSession>();
  private port: number;
  private mediaDir: string;
  private defaultTheme: string;
  private started = false;

  constructor(port: number, extensionPath: string, defaultTheme = 'auto') {
    this.port = port;
    this.mediaDir = path.join(extensionPath, 'media');
    this.defaultTheme = defaultTheme;
  }

  get isRunning(): boolean {
    return this.started;
  }

  getPort(): number {
    return this.port;
  }

  async start(): Promise<number> {
    if (this.started) {
      return this.port;
    }

    this.server = http.createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ noServer: true });

    this.server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const sid = url.pathname.replace(/^\/ws\//, '');
      const session = this.sessions.get(sid);
      if (!session || !url.pathname.startsWith('/ws/')) {
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        session.clients.add(ws);
        ws.on('close', () => session.clients.delete(ws));
      });
    });

    await new Promise<void>((resolve, reject) => {
      const tryListen = (port: number, retries: number) => {
        const onError = (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE' && retries > 0) {
            this.server!.close(() => tryListen(port + 1, retries - 1));
          } else {
            reject(err);
          }
        };
        this.server!.once('error', onError);
        this.server!.listen(port, '127.0.0.1', () => {
          this.server!.off('error', onError);
          this.port = port;
          this.started = true;
          resolve();
        });
      };
      tryListen(this.port, 20);
    });

    return this.port;
  }

  previewUrl(filePath: string): string {
    const sid = sessionId(filePath);
    return `http://127.0.0.1:${this.port}/preview/${sid}/${filePathInUrl(filePath)}`;
  }

  register(filePath: string, source: string): string {
    const sid = sessionId(filePath);
    if (!this.sessions.has(sid)) {
      this.sessions.set(sid, { filePath, clients: new Set() });
    } else {
      this.sessions.get(sid)!.filePath = filePath;
    }
    this.pushUpdate(filePath, source);
    return this.previewUrl(filePath);
  }

  pushUpdate(filePath: string, source: string): void {
    const sid = sessionId(filePath);
    const session = this.sessions.get(sid);
    if (!session) {
      return;
    }
    const html = renderMarkdown(filePath, source);
    const payload = JSON.stringify({ type: 'update', html });
    for (const client of session.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (url.pathname.startsWith('/preview/')) {
      const route = parsePreviewRoute(url.pathname);
      if (!route) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('无效的预览地址');
        return;
      }
      const session = this.sessions.get(route.sid);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('预览会话不存在，请从编辑器重新打开');
        return;
      }
      let source: string;
      try {
        source = fs.readFileSync(session.filePath, 'utf8');
      } catch {
        res.writeHead(500);
        res.end('无法读取文件');
        return;
      }
      const title = path.basename(session.filePath);
      const body = renderMarkdown(session.filePath, source);
      const page = previewPageHtml(title, body, `/ws/${route.sid}`, this.defaultTheme, session.filePath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page);
      return;
    }

    if (url.pathname === '/vendor/mermaid.min.js') {
      const file = path.join(this.mediaDir, 'mermaid.min.js');
      if (!fs.existsSync(file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('mermaid.min.js missing — run npm install');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      fs.createReadStream(file).pipe(res);
      return;
    }

    if (url.pathname === '/asset') {
      const assetPath = url.searchParams.get('path');
      if (!assetPath) {
        res.writeHead(400);
        res.end('missing path');
        return;
      }
      const resolved = path.resolve(assetPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const ext = path.extname(resolved).toLowerCase();
      const mime: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      fs.createReadStream(resolved).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end('not found');
  }

  async stop(): Promise<void> {
    for (const session of this.sessions.values()) {
      for (const client of session.clients) {
        client.close();
      }
    }
    this.sessions.clear();
    await new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
    await new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
    this.started = false;
  }
}
