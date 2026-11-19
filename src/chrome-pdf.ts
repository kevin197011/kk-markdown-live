// Copyright (c) 2026 kk
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import * as cp from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import WebSocket from "ws";

/** Resolve a Chrome/Chromium binary from a macOS app name or explicit path. */
export function resolveChromeExecutable(
	browserHint = "Google Chrome",
): string | undefined {
	if (browserHint.includes("/") || browserHint.endsWith(".exe")) {
		return fs.existsSync(browserHint) ? browserHint : undefined;
	}
	if (process.platform === "darwin") {
		const app = `/Applications/${browserHint}.app/Contents/MacOS/${browserHint}`;
		if (fs.existsSync(app)) {
			return app;
		}
		const fallbacks = [
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		];
		return fallbacks.find((p) => fs.existsSync(p));
	}
	if (process.platform === "win32") {
		const candidates = [
			path.join(
				process.env.LOCALAPPDATA || "",
				"Google/Chrome/Application/chrome.exe",
			),
			"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
			"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
			path.join(
				process.env.LOCALAPPDATA || "",
				"Microsoft/Edge/Application/msedge.exe",
			),
		];
		return candidates.find((p) => fs.existsSync(p));
	}
	const linux = [
		"google-chrome",
		"google-chrome-stable",
		"chromium",
		"chromium-browser",
		"microsoft-edge",
	];
	for (const name of linux) {
		try {
			const which = cp
				.execFileSync("which", [name], { encoding: "utf8" })
				.trim();
			if (which) {
				return which;
			}
		} catch {
			// continue
		}
	}
	return undefined;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url: string): Promise<unknown> {
	return new Promise((resolve, reject) => {
		http
			.get(url, (res) => {
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

type CdpClient = {
	send: (
		method: string,
		params?: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
	once: (event: string) => Promise<Record<string, unknown>>;
	close: () => void;
};

function connectCdp(wsUrl: string): Promise<CdpClient> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(wsUrl);
		let id = 0;
		const pending = new Map<
			number,
			{ res: (v: Record<string, unknown>) => void; rej: (e: Error) => void }
		>();
		const listeners = new Map<
			string,
			Array<(v: Record<string, unknown>) => void>
		>();
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
			const msg = JSON.parse(data.toString()) as {
				id?: number;
				error?: { message?: string };
				method?: string;
				result?: unknown;
				params?: unknown;
			};
			if (msg.id && pending.has(msg.id)) {
				const { res, rej } = pending.get(msg.id)!;
				pending.delete(msg.id);
				if (msg.error) {
					rej(new Error(msg.error.message || JSON.stringify(msg.error)));
				} else {
					res(msg as unknown as Record<string, unknown>);
				}
			} else if (msg.method && listeners.has(msg.method)) {
				const list = listeners.get(msg.method) || [];
				listeners.set(msg.method, []);
				for (const res of list) {
					res(msg as unknown as Record<string, unknown>);
				}
			}
		});
		ws.on("error", reject);
	});
}

function cdpValue<T = unknown>(msg: Record<string, unknown>): T | undefined {
	const result = msg.result as { result?: { value?: T } } | undefined;
	return result?.result?.value;
}

/**
 * Render `url` to a PDF file with Chrome headless (vector text via Page.printToPDF).
 */
export async function printUrlToPdf(
	chromePath: string,
	url: string,
	outPath: string,
	opts?: { timeoutMs?: number },
): Promise<void> {
	const timeoutMs = opts?.timeoutMs ?? 60000;
	const userData = fs.mkdtempSync(path.join(os.tmpdir(), "kk-md-pdf-"));
	const debugPort = 9300 + Math.floor(Math.random() * 500);
	const chrome = cp.spawn(
		chromePath,
		[
			"--headless=new",
			"--disable-gpu",
			"--no-first-run",
			"--no-default-browser-check",
			`--user-data-dir=${userData}`,
			`--remote-debugging-port=${debugPort}`,
			"about:blank",
		],
		{ stdio: "ignore" },
	);

	const deadline = Date.now() + timeoutMs;
	try {
		while (Date.now() < deadline) {
			try {
				await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
				break;
			} catch {
				await sleep(150);
			}
			if (Date.now() >= deadline) {
				throw new Error("Chrome debug port timeout");
			}
		}

		const pages = (await fetchJson(
			`http://127.0.0.1:${debugPort}/json/list`,
		)) as Array<{
			type?: string;
			webSocketDebuggerUrl?: string;
		}>;
		const page = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
		if (!page?.webSocketDebuggerUrl) {
			throw new Error("No Chrome page target for PDF export");
		}

		const cdp = await connectCdp(page.webSocketDebuggerUrl);
		try {
			await cdp.send("Page.enable");
			await cdp.send("Runtime.enable");
			const loaded = cdp.once("Page.loadEventFired");
			await cdp.send("Page.navigate", { url });
			await Promise.race([loaded, sleep(15000)]);
			await sleep(300);
			// Wait fonts + mermaid (if present)
			await cdp.send("Runtime.evaluate", {
				expression: `(async () => {
          if (document.fonts && document.fonts.ready) {
            try { await document.fonts.ready; } catch (e) {}
          }
          if (window.mermaid && document.querySelector('.mermaid')) {
            try { await window.mermaid.run(); } catch (e) {}
          }
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          return true;
        })()`,
				awaitPromise: true,
			});

			const printed = await cdp.send("Page.printToPDF", {
				printBackground: true,
				preferCSSPageSize: true,
				displayHeaderFooter: false,
				marginTop: 0.4,
				marginBottom: 0.4,
				marginLeft: 0.5,
				marginRight: 0.5,
				paperWidth: 8.27,
				paperHeight: 11.69,
			});
			const result = printed.result as { data?: string } | undefined;
			const data = result?.data;
			if (!data) {
				throw new Error("Page.printToPDF returned no data");
			}
			fs.writeFileSync(outPath, Buffer.from(data, "base64"));
		} finally {
			cdp.close();
		}
	} finally {
		chrome.kill("SIGKILL");
		try {
			fs.rmSync(userData, { recursive: true, force: true });
		} catch {
			// ignore
		}
	}
}

// silence unused in case tree-shake complains in tests
void cdpValue;
