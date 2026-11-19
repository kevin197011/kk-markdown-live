#!/usr/bin/env node
// Copyright (c) 2025 kk
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const media = path.join(root, "media");
fs.mkdirSync(media, { recursive: true });

function copyVendor(srcRel, destName) {
	const src = path.join(root, ...srcRel.split("/"));
	if (!fs.existsSync(src)) {
		console.error("missing " + destName + " — run npm install first");
		process.exit(1);
	}
	fs.copyFileSync(src, path.join(media, destName));
	console.log("copied media/" + destName);
}

copyVendor("node_modules/mermaid/dist/mermaid.min.js", "mermaid.min.js");
