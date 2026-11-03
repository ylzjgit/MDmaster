"use strict";

// 把说明书用的整屏截图缩到 1400px 宽，供公众号推文使用（微信正文宽度约 677px，2x 清晰度足够）
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SRC = ".docx-tpl/shots";
const OUT = "docs/promo/images";
const TARGET_WIDTH = 1400;

const MAP = [
  ["01-overview.png", "01-主界面.png"],
  ["06-copy.png", "02-复制到公众号.png"],
  ["03-editor.png", "03-代码高亮.png"],
  ["05-images.png", "04-图片与图注.png"],
  ["02-files.png", "05-文件管理.png"],
  ["08-shortcuts.png", "06-快捷键面板.png"],
  ["07-settings.png", "07-设置.png"],
];

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 400, height: 300 });
  await win.loadURL("data:text/html,<html><body></body></html>");

  for (const [src, dest] of MAP) {
    const buffer = fs.readFileSync(path.join(SRC, src));
    const dataUrl = "data:image/png;base64," + buffer.toString("base64");
    const resized = await win.webContents.executeJavaScript(
      "(async () => {" +
        "  const img = new Image();" +
        "  img.src = " + JSON.stringify(dataUrl) + ";" +
        "  await img.decode();" +
        "  const scale = Math.min(1, " + TARGET_WIDTH + " / img.naturalWidth);" +
        "  const canvas = document.createElement('canvas');" +
        "  canvas.width = Math.round(img.naturalWidth * scale);" +
        "  canvas.height = Math.round(img.naturalHeight * scale);" +
        "  const ctx = canvas.getContext('2d');" +
        "  ctx.imageSmoothingQuality = 'high';" +
        "  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);" +
        "  return canvas.toDataURL('image/png');" +
        "})()"
    );
    const outBuffer = Buffer.from(String(resized).split(",")[1], "base64");
    fs.writeFileSync(path.join(OUT, dest), outBuffer);
    console.log(dest, Math.round(buffer.length / 1024) + "KB ->", Math.round(outBuffer.length / 1024) + "KB");
  }
  app.exit(0);
});
