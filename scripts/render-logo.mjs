// Renders public/icon.svg to submission/logo-512.png (store logo upload).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const CHROME = process.env.CHROME_PATH ?? "/home/djalil/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
const svg = readFileSync("public/icon.svg", "utf8");
const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 512, height: 512 } });
await p.setContent(`<html><body style="margin:0;background:#FAF6F1;display:grid;place-items:center;height:512px">
<div style="width:400px;height:400px">${svg.replace("<svg ", '<svg width="400" height="400" ')}</div></body></html>`);
await p.screenshot({ path: "submission/logo-512.png" });
await b.close();
