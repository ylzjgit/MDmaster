"use strict";

// 把“复制到公众号”的 HTML 片段放进一个空窗口渲染并截图，
// 用来验证：不依赖应用 CSS，仅靠内联样式也能正确显示（等价于微信编辑器环境）。
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const clipPath = path.resolve(process.argv[2] || ".smoke/shot-clip.html");
const outPath = path.resolve(process.argv[3] || ".smoke/clip-shot.png");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 820, height: 1400, show: false, backgroundColor: "#ffffff" });
  const fragment = fs.readFileSync(clipPath, "utf8");
  const doc =
    "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">" +
    "<style>body{margin:0;padding:24px;background:#fff}</style></head><body>" +
    fragment +
    "</body></html>";
  const tmp = path.join(path.dirname(outPath), "clip-view.html");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(tmp, doc, "utf8");
  await win.loadFile(tmp);
  await new Promise((resolve) => setTimeout(resolve, 900));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(outPath, image.toPNG());
  console.log("clip screenshot: " + outPath);
  app.exit(0);
});
