#!/usr/bin/env node
/**
 * Regression: html2pdf + position:fixed → blank canvas (height 0).
 * Expect relative layout to produce non-white pixels.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const media = path.join(__dirname, '..', 'media');
const bundle = path.join(media, 'html2pdf.bundle.min.js');
if (!fs.existsSync(bundle)) {
  console.error('missing media/html2pdf.bundle.min.js — run npm install');
  process.exit(1);
}

let resolveResult;
const resultPromise = new Promise((r) => {
  resolveResult = r;
});

const page = `<!DOCTYPE html><html><body>
<script src="/html2pdf.bundle.min.js"></script>
<script>
async function run(css, label) {
  const root = document.createElement('div');
  root.setAttribute('style', css);
  root.innerHTML = '<h1>Hello</h1><p style="color:red;font-size:28px">RED '+label+'</p>';
  document.body.appendChild(root);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  void root.offsetHeight;
  const canvas = await html2pdf().set({
    html2canvas: { scale: 1, backgroundColor: '#ffffff', logging: false, scrollX: 0, scrollY: 0 },
  }).from(root).toCanvas().get('canvas');
  let nonWhite = 0;
  if (canvas.width && canvas.height) {
    const d = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    for (let i=0;i<d.length;i+=16) if (d[i]<250||d[i+1]<250||d[i+2]<250) nonWhite++;
  }
  root.remove();
  document.querySelectorAll('.html2pdf__overlay').forEach(n => n.remove());
  return { label, canvasH: canvas.height, nonWhite };
}
(async () => {
  const fixed = await run('position:fixed;left:0;top:0;width:800px;background:#fff;color:#111;','fixed');
  const relative = await run('position:relative;width:800px;background:#fff;color:#111;','relative');
  await fetch('/result', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fixed, relative}) });
})().catch(async (e) => {
  await fetch('/result', { method:'POST', body: JSON.stringify({error:String(e)}) });
});
</script></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(page);
    return;
  }
  if (req.url === '/html2pdf.bundle.min.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    fs.createReadStream(bundle).pipe(res);
    return;
  }
  if (req.url === '/result' && req.method === 'POST') {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      res.end('ok');
      resolveResult(b);
    });
    return;
  }
  res.end();
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!fs.existsSync(chrome)) {
    console.error('Google Chrome not found — skip');
    server.close();
    process.exit(0);
  }
  const userData = fs.mkdtempSync('/tmp/kk-chrome-');
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--window-size=1280,800',
      '--user-data-dir=' + userData,
      '--no-first-run',
      'http://127.0.0.1:' + port + '/',
    ],
    { stdio: 'ignore' },
  );
  const t = setTimeout(() => resolveResult(JSON.stringify({ error: 'timeout' })), 30000);
  const body = await resultPromise;
  clearTimeout(t);
  child.kill('SIGKILL');
  server.close();
  const data = JSON.parse(body);
  if (data.error) {
    console.error(data);
    process.exit(1);
  }
  console.log(JSON.stringify(data));
  if (!(data.fixed.canvasH === 0 || data.fixed.nonWhite === 0)) {
    console.error('expected fixed → blank');
    process.exit(1);
  }
  if (!(data.relative.canvasH > 0 && data.relative.nonWhite > 0)) {
    console.error('expected relative → content');
    process.exit(1);
  }
  console.log('ok: relative captures content; fixed blanks');
});
