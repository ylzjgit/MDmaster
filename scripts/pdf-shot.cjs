"use strict";

// 用 Electron 内置 PDF 阅读器渲染指定页并截图，用于核对文档版式
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const pdfPath = path.resolve(process.argv[2]);
const page = process.argv[3] || "1";
const outPath = path.resolve(process.argv[4] || ".docx-tpl/out/page.png");

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1240,
    height: 1754,
    show: false,
    webPreferences: { plugins: true },
  });
  await win.loadURL("file:///" + pdfPath.replace(/\\/g, "/") + "#page=" + page + "&zoom=117");
  await new Promise((resolve) => setTimeout(resolve, 2600));
  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, image.toPNG());
  console.log("saved " + outPath);
  app.exit(0);
});
