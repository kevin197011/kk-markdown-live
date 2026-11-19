#!/usr/bin/env node
// Copyright (c) 2026 kk
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/**
 * E2E: start real PreviewServer, open REQUIREMENTS.md preview in headless Chrome,
 * click Export PDF, save download, rasterize pages for inspection.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const root = path.join(__dirname, "..");
const { PreviewServer } = require("../out/e2e/preview-lib.js");

const OUT = process.env.PDF_E2E_OUT || "/tmp/kk-md-pdf-e2e";
const MD = path.join(root, "docs/REQUIREMENTS.md");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) {
	fs.unlinkSync(path.join(OUT, f));
}

async function main() {
	if (!fs.existsSync(CHROME)) {
		console.error("Chrome missing");
		process.exit(1);
	}
	const srv = new PreviewServer(19627, root, "light");
	const port = await srv.start();
	const source = fs.readFileSync(MD, "utf8");
	const url = srv.register(MD, source);
	console.log("preview", url, "port", port);

	// CDP via --remote-debugging-port to click export and capture download
	const userData = fs.mkdtempSync("/tmp/kk-chrome-e2e-");
	const debugPort = 9222 + Math.floor(Math.random() * 1000);
	const chrome = spawn(
		CHROME,
		[
			"--headless=new",
			"--disable-gpu",
			"--window-size=1280,900",
			`--user-data-dir=${userData}`,
			"--no-first-run",
			`--remote-debugging-port=${debugPort}`,
			"about:blank",
		],
		{ stdio: ["ignore", "ignore", "pipe"] },
	);

	await waitPort(debugPort, 15000);
	const pages = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
	const page = pages.find((p) => p.type === "page") || pages[0];
	if (!page?.webSocketDebuggerUrl)
		throw new Error("no page: " + JSON.stringify(pages));
	console.log("cdp page", page.url, page.id);

	const pageCdp = await connectCdp(page.webSocketDebuggerUrl);
	await pageCdp.send("Page.enable");
	await pageCdp.send("Runtime.enable");
	await pageCdp
		.send("Browser.setDownloadBehavior", {
			behavior: "allow",
			downloadPath: OUT,
			eventsEnabled: true,
		})
		.catch(async () => {
			await pageCdp.send("Page.setDownloadBehavior", {
				behavior: "allow",
				downloadPath: OUT,
			});
		});

	const loaded = pageCdp.once("Page.loadEventFired");
	const nav = await pageCdp.send("Page.navigate", { url });
	console.log("nav", nav.result || nav);
	await Promise.race([loaded, sleep(10000)]);
	await sleep(500);
	const sniff = await pageCdp.send("Runtime.evaluate", {
		expression: `({ title: document.title, hasBtn: !!document.getElementById('pdf-export'), body: document.body && document.body.innerText.slice(0,200), href: location.href, ready: document.readyState })`,
		returnByValue: true,
	});
	console.log("sniff", cdpValue(sniff), sniff);
	if (!cdpValue(sniff)?.hasBtn) {
		throw new Error(
			"preview page missing pdf button: " + JSON.stringify(cdpValue(sniff)),
		);
	}
	await sleep(500);

	const sid = url.split("/preview/")[1].split("/")[0];
	console.log("export via /export-pdf/" + sid);
	const pdfPath = path.join(OUT, "REQUIREMENTS.pdf");
	await download(`http://127.0.0.1:${port}/export-pdf/${sid}`, pdfPath);
	const click = { result: { value: { ok: true, mode: "chrome-print" } } };

	console.log("pdf", pdfPath, "size", fs.statSync(pdfPath).size);

	// Rasterize with ImageMagick
	const pageGlob = path.join(OUT, "page.png");
	await run("magick", [
		"-density",
		"120",
		pdfPath,
		"-alpha",
		"remove",
		"-background",
		"white",
		path.join(OUT, "page.png"),
	]);
	const pagesOut = fs
		.readdirSync(OUT)
		.filter(
			(f) =>
				/^page(-\\d+)?\\.png$/.test(f) ||
				/^page\\.png$/.test(f) ||
				f.startsWith("page"),
		);
	// ImageMagick may write page-0.png page-1.png or page.png page-1.png
	const pngs = fs
		.readdirSync(OUT)
		.filter((f) => f.endsWith(".png"))
		.sort();
	console.log("pages", pngs.length, pngs.join(","));
	fs.writeFileSync(
		path.join(OUT, "meta.json"),
		JSON.stringify(
			{
				pdfPath,
				pngs: pngs.map((f) => path.join(OUT, f)),
				url,
				exportResult: click?.result,
			},
			null,
			2,
		),
	);

	chrome.kill("SIGKILL");
	process.exit(0);
}

function download(u, dest) {
	return new Promise((resolve, reject) => {
		http
			.get(u, (res) => {
				if (res.statusCode !== 200) {
					let b = "";
					res.on("data", (c) => (b += c));
					res.on("end", () =>
						reject(new Error("export-pdf " + res.statusCode + " " + b)),
					);
					return;
				}
				const f = fs.createWriteStream(dest);
				res.pipe(f);
				f.on("finish", () => f.close(() => resolve()));
			})
			.on("error", reject);
	});
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

function waitPort(port, timeoutMs) {
	const start = Date.now();
	return new Promise(async (resolve, reject) => {
		while (Date.now() - start < timeoutMs) {
			try {
				await fetchJson(`http://127.0.0.1:${port}/json/version`);
				resolve();
				return;
			} catch (_) {
				await sleep(200);
			}
		}
		reject(new Error("debug port timeout"));
	});
}

function fetchJson(u) {
	return new Promise((resolve, reject) => {
		http
			.get(u, (res) => {
				let b = "";
				res.on("data", (c) => (b += c));
				res.on("end", () => {
					try {
						resolve(JSON.parse(b));
					} catch (e) {
						reject(e);
					}
				});
			})
			.on("error", reject);
	});
}

function connectCdp(wsUrl) {
	return new Promise((resolve, reject) => {
		const WebSocket = require("ws");
		const ws = new WebSocket(wsUrl);
		let id = 0;
		const pending = new Map();
		const listeners = new Map();
		ws.on("open", () => {
			resolve({
				send(method, params = {}) {
					const msgId = ++id;
					return new Promise((res, rej) => {
						pending.set(msgId, { res, rej });
						ws.send(JSON.stringify({ id: msgId, method, params }));
					});
				},
				once(event) {
					return new Promise((res) => {
						const list = listeners.get(event) || [];
						list.push(res);
						listeners.set(event, list);
					});
				},
				close() {
					ws.close();
				},
			});
		});
		ws.on("message", (data) => {
			const msg = JSON.parse(data.toString());
			if (msg.id && pending.has(msg.id)) {
				const { res, rej } = pending.get(msg.id);
				pending.delete(msg.id);
				if (msg.error) rej(new Error(JSON.stringify(msg.error)));
				else res(msg);
			} else if (msg.method && listeners.has(msg.method)) {
				const list = listeners.get(msg.method) || [];
				listeners.set(msg.method, []);
				for (const res of list) res(msg);
			}
		});
		ws.on("error", reject);
	});
}

function cdpValue(msg) {
	return msg?.result?.result?.value;
}

async function waitExpr(cdp, expr, timeoutMs) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const r = await cdp.send("Runtime.evaluate", {
			expression: expr,
			returnByValue: true,
		});
		if (cdpValue(r)) return;
		await sleep(200);
	}
	throw new Error("waitExpr timeout: " + expr);
}

function run(cmd, args) {
	return new Promise((resolve, reject) => {
		const p = spawn(cmd, args, { stdio: "inherit" });
		p.on("exit", (code) =>
			code === 0 ? resolve() : reject(new Error(cmd + " " + code)),
		);
	});
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
