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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildRenderer(mdFile: string): Renderer {
  const renderer = new Renderer();
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

const PREVIEW_CSS = `
  :root {
    color-scheme: light dark;
    --bg: #fafafa;
    --fg: #1a1a1a;
    --muted: #666;
    --border: #e5e5e5;
    --code-bg: #f4f4f5;
    --link: #0969da;
    --blockquote: #57606a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d1117;
      --fg: #e6edf3;
      --muted: #8b949e;
      --border: #30363d;
      --code-bg: #161b22;
      --link: #58a6ff;
      --blockquote: #8b949e;
    }
  }
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
  header .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
  main {
    max-width: 900px;
    margin: 0 auto;
    padding: 32px 24px 64px;
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

function previewPageHtml(title: string, bodyHtml: string, wsPath: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${PREVIEW_CSS}</style>
</head>
<body>
  <header>
    <span class="title">${escapeHtml(title)}</span>
    <span class="status live" id="status">实时预览</span>
  </header>
  <main>
    <article class="markdown-body" id="content">${bodyHtml}</article>
  </main>
  <script src="/vendor/mermaid.min.js"></script>
  <script>
    (function () {
      const content = document.getElementById('content');
      const status = document.getElementById('status');
      let ws;

      function mermaidTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
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

      function renderMermaid() {
        if (typeof mermaid === 'undefined') return Promise.resolve();
        const nodes = content.querySelectorAll('.mermaid');
        if (!nodes.length) return Promise.resolve();
        mermaid.initialize({ theme: mermaidTheme() });
        return mermaid.run({ nodes: Array.from(nodes), suppressErrors: true }).catch(function () {});
      }

      function afterContentUpdate() {
        renderMermaid();
      }

      initMermaid();
      afterContentUpdate();

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
  private started = false;

  constructor(port: number, extensionPath: string) {
    this.port = port;
    this.mediaDir = path.join(extensionPath, 'media');
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
    return `http://127.0.0.1:${this.port}/preview/${sid}`;
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
      const sid = url.pathname.replace('/preview/', '');
      const session = this.sessions.get(sid);
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
      const page = previewPageHtml(title, body, `/ws/${sid}`);
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
