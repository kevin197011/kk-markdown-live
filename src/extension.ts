import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { PreviewServer } from "./preview";

let extensionPath = "";
let server: PreviewServer | undefined;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const statusBar = vscode.window.createStatusBarItem(
	vscode.StatusBarAlignment.Right,
	100,
);

function getConfig() {
	const cfg = vscode.workspace.getConfiguration("kk-markdown-live");
	return {
		port: cfg.get<number>("port", 19527),
		browser: cfg.get<string>("browser", "Google Chrome"),
		debounceMs: cfg.get<number>("debounceMs", 300),
		theme: cfg.get<string>("theme", "auto"),
	};
}

async function ensureServer(): Promise<PreviewServer> {
	if (!server) {
		const { port, theme, browser } = getConfig();
		const srv = new PreviewServer(port, extensionPath, theme, browser);
		srv.setOnIdle(() => {
			void stopServerIfIdle();
		});
		await srv.start();
		server = srv;
		statusBar.text = `$(radio-tower) KK Preview :${server.getPort()}`;
		statusBar.tooltip = "KK Markdown Live preview server running";
		statusBar.show();
	}
	return server;
}

async function stopServerIfIdle(): Promise<void> {
	if (!server || server.hasActiveClients() || server.getSessionCount() > 0) {
		return;
	}
	await server.stop();
	server = undefined;
	statusBar.hide();
}

function readFileContent(filePath: string): string {
	const uri = vscode.Uri.file(filePath);
	const openDoc = vscode.workspace.textDocuments.find(
		(d) => d.uri.fsPath === filePath,
	);
	if (openDoc) {
		return openDoc.getText();
	}
	return fs.readFileSync(filePath, "utf8");
}

function openInChrome(url: string, newWindow: boolean): void {
	const { browser } = getConfig();
	if (process.platform === "darwin") {
		const args = ["-a", browser];
		if (newWindow) {
			args.push("-n");
		}
		args.push(url);
		cp.spawn("open", args, { detached: true, stdio: "ignore" }).unref();
		return;
	}
	if (process.platform === "win32") {
		const chromePaths = [
			path.join(
				process.env.LOCALAPPDATA || "",
				"Google/Chrome/Application/chrome.exe",
			),
			"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
			"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
		];
		const chrome = chromePaths.find((p) => fs.existsSync(p));
		if (chrome) {
			const args = newWindow ? ["--new-window", url] : [url];
			cp.spawn(chrome, args, { detached: true, stdio: "ignore" }).unref();
			return;
		}
	}
	vscode.env.openExternal(vscode.Uri.parse(url));
}

async function openPreview(uri?: vscode.Uri, newWindow = false): Promise<void> {
	const target = uri ?? vscode.window.activeTextEditor?.document.uri;
	if (!target) {
		vscode.window.showWarningMessage("Open a Markdown file first");
		return;
	}
	if (!target.fsPath.endsWith(".md")) {
		vscode.window.showWarningMessage("Only .md files are supported");
		return;
	}

	try {
		const srv = await ensureServer();
		const content = readFileContent(target.fsPath);
		const url = srv.register(target.fsPath, content);
		openInChrome(url, newWindow);
		vscode.window.setStatusBarMessage(
			`$(open-preview) Chrome preview: ${path.basename(target.fsPath)}`,
			3000,
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage(`Failed to start preview: ${msg}`);
	}
}

function schedulePush(filePath: string): void {
	const { debounceMs } = getConfig();
	const existing = debounceTimers.get(filePath);
	if (existing) {
		clearTimeout(existing);
	}
	debounceTimers.set(
		filePath,
		setTimeout(() => {
			debounceTimers.delete(filePath);
			if (!server?.isRunning) {
				return;
			}
			try {
				const content = readFileContent(filePath);
				server.pushUpdate(filePath, content);
			} catch {
				// file may be deleted
			}
		}, debounceMs),
	);
}

export function activate(context: vscode.ExtensionContext): void {
	extensionPath = context.extensionPath;
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"kk-markdown-live.openPreview",
			(uri?: vscode.Uri) => openPreview(uri, false),
		),
		vscode.commands.registerCommand(
			"kk-markdown-live.openPreviewToSide",
			(uri?: vscode.Uri) => openPreview(uri, true),
		),
		vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.languageId !== "markdown") {
				return;
			}
			schedulePush(e.document.uri.fsPath);
		}),
		vscode.workspace.onDidSaveTextDocument((doc) => {
			if (doc.languageId !== "markdown" || !server?.isRunning) {
				return;
			}
			server.pushUpdate(doc.uri.fsPath, doc.getText());
		}),
		statusBar,
	);
}

export async function deactivate(): Promise<void> {
	for (const t of debounceTimers.values()) {
		clearTimeout(t);
	}
	debounceTimers.clear();
	statusBar.dispose();
	if (server) {
		await server.stop();
		server = undefined;
	}
}
