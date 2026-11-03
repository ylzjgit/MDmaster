"use strict";

// 生成品牌图标：build/icon.ico（多尺寸 PNG-in-ICO）+ build/icon.png
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SIZES = [16, 24, 32, 48, 64, 128, 256];

const page = [
  "<!doctype html><html><head><meta charset='utf-8'></head><body><script>",
  "function roundRect(ctx, x, y, w, h, r) {",
  "  ctx.beginPath();",
  "  ctx.moveTo(x + r, y);",
  "  ctx.lineTo(x + w - r, y);",
  "  ctx.quadraticCurveTo(x + w, y, x + w, y + r);",
  "  ctx.lineTo(x + w, y + h - r);",
  "  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);",
  "  ctx.lineTo(x + r, y + h);",
  "  ctx.quadraticCurveTo(x, y + h, x, y + h - r);",
  "  ctx.lineTo(x, y + r);",
  "  ctx.quadraticCurveTo(x, y, x + r, y);",
  "  ctx.closePath();",
  "}",
  "window.drawIcon = function (size) {",
  "  const canvas = document.createElement('canvas');",
  "  canvas.width = size;",
  "  canvas.height = size;",
  "  const ctx = canvas.getContext('2d');",
  "  const radius = Math.max(2, size * 0.22);",
  "  roundRect(ctx, 0, 0, size, size, radius);",
  "  const gradient = ctx.createLinearGradient(0, 0, size, size);",
  "  gradient.addColorStop(0, '#3b6ef6');",
  "  gradient.addColorStop(1, '#7aa5ff');",
  "  ctx.fillStyle = gradient;",
  "  ctx.fill();",
  "  const small = size < 40;",
  "  ctx.fillStyle = '#ffffff';",
  "  ctx.font = '700 ' + Math.round(size * (small ? 0.56 : 0.42)) + 'px \"Segoe UI\", Arial, sans-serif';",
  "  ctx.textAlign = 'center';",
  "  ctx.textBaseline = 'middle';",
  "  ctx.fillText(small ? 'M' : 'MD', size / 2, size * 0.53);",
  "  return canvas.toDataURL('image/png');",
  "};",
  "</script></body></html>",
].join("\n");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 400, height: 300 });
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(page));

  const pngs = [];
  for (const size of SIZES) {
    const dataUrl = await win.webContents.executeJavaScript("drawIcon(" + size + ")");
    pngs.push({ size, buffer: Buffer.from(String(dataUrl).split(",")[1], "base64") });
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const png of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(png.size >= 256 ? 0 : png.size, 0);
    entry.writeUInt8(png.size >= 256 ? 0 : png.size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.buffer.length;
  }

  const ico = Buffer.concat([header, ...entries, ...pngs.map((item) => item.buffer)]);
  fs.mkdirSync("build", { recursive: true });
  fs.writeFileSync(path.join("build", "icon.ico"), ico);

  const bigUrl = await win.webContents.executeJavaScript("drawIcon(512)");
  fs.writeFileSync(path.join("build", "icon.png"), Buffer.from(String(bigUrl).split(",")[1], "base64"));

  console.log("icon.ico bytes:", ico.length);
  app.exit(0);
});
