#!/usr/bin/env node
// Copyright (c) 2026 kk
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * Regression: long flex PDF root must capture full height (not one viewport).
 */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const media = path.join(__dirname, "..", "media");
const bundle = path.join(media, "html2pdf.bundle.min.js");
if (!fs.existsSync(bundle)) {
	console.error("missing media/html2pdf.bundle.min.js");
	process.exit(1);
}

let resolveResult;
const resultPromise = new Promise((r) => {
	resolveResult = r;
});

const page = `<!DOCTYPE html><html><head><style>
#pdf-export-root {
  position: relative; width: 800px; margin: 0 auto; background: #fff; color: #111;
  overflow: visible; height: auto; max-height: none; padding: 16px 24px 48px;
}
.marker { color: red; font-size: 20px; }
</style></head><body>
<script src="/html2pdf.bundle.min.js"></script>
<script>
(async () => {
  const root = document.createElement('div');
  root.id = 'pdf-export-root';
  let html = '';
  for (let i = 1; i <= 40; i++) {
    html += '<h2>Section ' + i + '</h2><p>' + ('lorem '.repeat(40)) + '</p>';
  }
  html += '<p class="marker" id="END">END_MARKER_VISIBLE</p>';
  root.innerHTML = html;
  document.body.appendChild(root);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  void root.offsetHeight;
  const scrollH = root.scrollHeight;
  const worker = html2pdf().set({
    margin: [12,12,12,12],
    html2canvas: {
      scale: 1,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: root.scrollWidth,
      windowHeight: root.scrollHeight,
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  }).from(root);
  const canvas = await worker.toCanvas().get('canvas');
  // Also produce PDF blob page count roughly via jsPDF
  const pdf = await html2pdf().set({
    margin: [12,12,12,12],
    html2canvas: {
      scale: 1, backgroundColor: '#ffffff', logging: false,
      scrollX: 0, scrollY: 0,
      windowWidth: root.scrollWidth, windowHeight: root.scrollHeight,
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  }).from(root).toPdf().get('pdf');
  const pages = pdf.internal.getNumberOfPages();
  await fetch('/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scrollH, canvasH: canvas.height, pages,
      // canvas should be much taller than a single A4-ish capture at scale 1 (~1122px)
      okHeight: canvas.height >= scrollH * 0.9,
      okPages: pages >= 3,
    }),
  });
})().catch(async (e) => {
  await fetch('/result', { method: 'POST', body: JSON.stringify({ error: String(e) }) });
});
</script></body></html>`;

const server = http.createServer((req, res) => {
	if (req.url === "/") {
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(page);
		return;
	}
	if (req.url === "/html2pdf.bundle.min.js") {
		res.writeHead(200, { "Content-Type": "application/javascript" });
		fs.createReadStream(bundle).pipe(res);
		return;
	}
	if (req.url === "/result" && req.method === "POST") {
		let b = "";
		req.on("data", (c) => (b += c));
		req.on("end", () => {
			res.end("ok");
			resolveResult(b);
		});
		return;
	}
	res.end();
});

server.listen(0, "127.0.0.1", async () => {
	const port = server.address().port;
	const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
	if (!fs.existsSync(chrome)) {
		console.error("Google Chrome not found — skip");
		server.close();
		process.exit(0);
	}
	const userData = fs.mkdtempSync("/tmp/kk-chrome-");
	const child = spawn(
		chrome,
		[
			"--headless=new",
			"--disable-gpu",
			"--window-size=1280,800",
			"--user-data-dir=" + userData,
			"--no-first-run",
			"http://127.0.0.1:" + port + "/",
		],
		{ stdio: "ignore" },
	);
	const t = setTimeout(
		() => resolveResult(JSON.stringify({ error: "timeout" })),
		60000,
	);
	const body = await resultPromise;
	clearTimeout(t);
	child.kill("SIGKILL");
	server.close();
	const data = JSON.parse(body);
	console.log(JSON.stringify(data));
	if (data.error) process.exit(1);
	if (!data.okHeight || !data.okPages) {
		console.error("full-body capture failed");
		process.exit(1);
	}
	console.log("ok: long flex body captured across multiple pages");
});
