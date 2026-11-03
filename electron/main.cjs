"use strict";

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard, net, protocol } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");

// 本地图片协议：mdlocal:///<绝对路径>，dev(http) 与打包(file) 两种模式下都能显示
protocol.registerSchemesAsPrivileged([
  { scheme: "mdlocal", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const DEV_SERVER_URL = process.env.MDMaster_DEV_SERVER_URL || "";
const SMOKE_OUT = process.env.MDMaster_SMOKE_OUT || "";
const SMOKE_ROOT = process.env.MDMaster_SMOKE_ROOT || "";
const SMOKE_FILE = process.env.MDMaster_SMOKE_FILE || "";
const SMOKE_WAIT = Number(process.env.MDMaster_SMOKE_WAIT || 6000);
const SHOTS_DIR = process.env.MDMaster_SHOTS_DIR || "";

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".svn", ".hg", "dist", "dist-electron", "release",
  ".vite", ".cache", ".idea", ".vscode", "__pycache__", ".smoke",
]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".avif"]);
const SKIP_FILE_EXT = new Set([".pdf", ".zip", ".exe", ".dll", ".mp4", ".mp3", ".woff", ".woff2", ".ttf"]);
const MD_EXT = new Set([".md", ".markdown", ".mdx"]);
const BACKSLASH = String.fromCharCode(92);
const ILLEGAL_NAME_CHARS = ["/", ":", "*", "?", '"', "<", ">", "|", BACKSLASH];

const state = { root: "", watcher: null, win: null, logs: [] };

// 冒烟测试使用独立 userData，避免污染用户真实设置
if (SMOKE_OUT) {
  try {
    const isolated = path.join(path.dirname(path.resolve(SMOKE_OUT)), "userdata");
    fsSync.mkdirSync(isolated, { recursive: true });
    app.setPath("userData", isolated);
  } catch {
    /* 忽略 */
  }
}

/* --------------------------------------------------------- 设置与图床 */

const SETTINGS_DEFAULTS = {
  imageDir: "assets",
  uploadProvider: "wechat",
  wechatAppId: "",
  wechatAppSecret: "",
  customUploadUrl: "",
  customFieldName: "file",
  customUrlPath: "data.url",
  githubOwner: "",
  githubRepo: "",
  githubBranch: "main",
  githubPath: "mdimages",
  githubToken: "",
};

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);

let settings = Object.assign({}, SETTINGS_DEFAULTS);
let uploadCache = {};
let tokenCache = { token: "", expires: 0 };

const settingsFile = () => path.join(app.getPath("userData"), "mdmaster-settings.json");
const uploadCacheFile = () => path.join(app.getPath("userData"), "mdmaster-upload-cache.json");

async function loadPersistedState() {
  try {
    settings = Object.assign({}, SETTINGS_DEFAULTS, JSON.parse(await fs.readFile(settingsFile(), "utf8")));
  } catch {
    settings = Object.assign({}, SETTINGS_DEFAULTS);
  }
  try {
    uploadCache = JSON.parse(await fs.readFile(uploadCacheFile(), "utf8")) || {};
  } catch {
    uploadCache = {};
  }
}

async function persistSettings(patch) {
  const next = Object.assign({}, settings, patch || {});
  settings = next;
  tokenCache = { token: "", expires: 0 };
  try {
    await fs.mkdir(path.dirname(settingsFile()), { recursive: true });
    await fs.writeFile(settingsFile(), JSON.stringify(next, null, 2), "utf8");
  } catch {
    /* 忽略写入失败 */
  }
  return next;
}

async function persistUploadCache() {
  try {
    await fs.mkdir(path.dirname(uploadCacheFile()), { recursive: true });
    await fs.writeFile(uploadCacheFile(), JSON.stringify(uploadCache), "utf8");
  } catch {
    /* 忽略 */
  }
}

function mimeFromExt(ext) {
  return MIME_BY_EXT[String(ext || "").toLowerCase()] || "image/png";
}

function extFromType(type, name) {
  const byType = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "image/svg+xml": ".svg",
  };
  if (byType[type]) return byType[type];
  const ext = path.extname(String(name || "")).toLowerCase();
  if (MIME_BY_EXT[ext]) return ext === ".jpeg" ? ".jpg" : ext;
  return ".png";
}

function localPathFromSrc(src) {
  const text = String(src || "");
  if (text.indexOf("mdlocal:") !== 0) return null;
  if (text.indexOf("mdlocal://remote/") === 0 || text.indexOf("mdlocal:///remote?") === 0) return null;
  let decoded = decodeURIComponent(text.replace(/^mdlocal:\/\/\//, ""));
  if (/^\/[A-Za-z]:/.test(decoded)) decoded = decoded.slice(1);
  return path.resolve(decoded);
}

async function getWechatToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expires > now + 120000) return tokenCache.token;
  if (!settings.wechatAppId || !settings.wechatAppSecret) {
    throw new Error("未配置公众号 AppID / AppSecret，请先在设置中填写");
  }
  const url =
    "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=" +
    encodeURIComponent(settings.wechatAppId) +
    "&secret=" +
    encodeURIComponent(settings.wechatAppSecret);
  const response = await fetch(url);
  const json = await response.json();
  if (!json.access_token) {
    const errmsg = String(json.errmsg || json.errcode || "未知错误");
    if (/invalid ip/i.test(errmsg)) {
      const seenIp = (/invalid ip\s+([0-9.]+)/i.exec(errmsg) || [])[1] || "";
      const samples = await sampleEgressIps(2).catch(() => []);
      const distinct = Array.from(new Set(samples));
      const note =
        distinct.length > 1
          ? "实测本机出口 IP 会随连接变化（" + distinct.join(" / ") + "），这是运营商 NAT 池导致的，白名单几乎不可能稳定命中。"
          : "本机当前出口 IP：" + (distinct[0] || "检测失败") + "。";
      throw new Error(
        "公众号接口拒绝：微信看到的出口 IP 是 " + (seenIp || "未知") + "，不在 IP 白名单里。" +
          note +
          "可选方案：① 把它加入公众号「设置与开发 → 基本配置 → IP 白名单」后重试；② 或改用「GitHub 图床」/「自定义图床」，这两条不需要白名单。"
      );
    }
    throw new Error(
      "获取 access_token 失败：" + errmsg + "（请检查 AppID / AppSecret，并把本机公网 IP 加入公众号 IP 白名单）"
    );
  }
  tokenCache = { token: json.access_token, expires: now + (Number(json.expires_in) || 7200) * 1000 };
  return tokenCache.token;
}

async function uploadToWechat(buffer, fileName, mime) {
  if (buffer.length > 1024 * 1024) {
    throw new Error("图片超过 1MB，公众号 uploadimg 接口不支持，请压缩后再试");
  }
  const token = await getWechatToken();
  const form = new FormData();
  form.append("media", new Blob([buffer], { type: mime }), fileName);
  const response = await fetch(
    "https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=" + encodeURIComponent(token),
    { method: "POST", body: form }
  );
  const json = await response.json();
  if (!json.url) {
    if (json.errcode === 40001 || json.errcode === 42001 || json.errcode === 40014) {
      tokenCache = { token: "", expires: 0 };
    }
    throw new Error("上传图片失败：" + (json.errmsg || json.errcode || "未知错误"));
  }
  return json.url;
}

async function uploadToCustom(buffer, fileName, mime) {
  if (!settings.customUploadUrl) throw new Error("未配置自定义图床地址");
  const form = new FormData();
  form.append(settings.customFieldName || "file", new Blob([buffer], { type: mime }), fileName);
  const response = await fetch(settings.customUploadUrl, { method: "POST", body: form });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("图床返回的不是 JSON：" + text.slice(0, 120));
  }
  const value = String(settings.customUrlPath || "data.url")
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc == null ? acc : acc[key]), json);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("未能从图床返回结果中取到图片地址，请检查 JSON 路径");
  }
  return value;
}

/* ------------------------------------------------------ 出口 IP 与 GitHub 图床 */

/** 取样公网出口 IP（Node fetch 直连，与调用微信接口同一条出口） */
async function sampleEgressIps(times) {
  const ips = [];
  const endpoints = ["https://ifconfig.me/ip", "https://api.ipify.org", "https://ipinfo.io/ip"];
  for (let i = 0; i < (times || 2); i += 1) {
    for (const endpoint of endpoints) {
      try {
        // 强制每次新建连接，才能暴露「每连接换 IP」的运营商 NAT 池
        const response = await fetch(endpoint, {
          headers: { Connection: "close" },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) continue;
        const text = (await response.text()).trim();
        const match = /([0-9]{1,3}(?:\.[0-9]{1,3}){3})/.exec(text);
        if (match) {
          ips.push(match[1]);
          break;
        }
      } catch {
        /* 换下一个服务 */
      }
    }
    if (i < (times || 2) - 1) await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return ips;
}

/** 把本地图片提交到 GitHub 仓库，返回可公网访问的地址（jsDelivr CDN，国内速度好） */
async function uploadToGithub(buffer, fileName, mime) {
  const owner = String(settings.githubOwner || "").trim();
  const repo = String(settings.githubRepo || "").trim();
  const branch = String(settings.githubBranch || "main").trim() || "main";
  const token = String(settings.githubToken || "").trim();
  const prefix = String(settings.githubPath || "mdimages").replace(/^\/+|\/+$/g, "");
  if (!owner || !repo) throw new Error("未配置 GitHub 图床的 owner / repo");
  if (!token) throw new Error("未配置 GitHub 图床的 Token（需要该仓库 Contents 写权限）");
  if (buffer.length > 20 * 1024 * 1024) throw new Error("图片超过 20MB，GitHub 接口不接受");

  const safeName = fileName.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
  const path = prefix + "/" + safeName;
  const url = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  const body = JSON.stringify({
    message: "upload image: " + safeName,
    content: buffer.toString("base64"),
    branch,
  });
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "MDMaster",
    },
    body,
    signal: AbortSignal.timeout(60000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      "GitHub 图床上传失败：" +
        (json.message || response.status) +
        (response.status === 401 || response.status === 403 ? "（检查 Token 是否有该仓库 Contents 写权限）" : "")
    );
  }
  // cdn.jsdelivr.net / fastly 在国内时好时坏，按顺序挑一个能通的镜像；
  // 用提交 SHA 作 ref，新图能立刻命中（@branch 会被 CDN 缓存拖住）
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const ref = (json.commit && json.commit.sha) || branch;
  const templates = [
    "https://gcore.jsdelivr.net/gh/{owner}/{repo}@{ref}/{path}",
    "https://fastly.jsdelivr.net/gh/{owner}/{repo}@{ref}/{path}",
    "https://cdn.jsdelivr.net/gh/{owner}/{repo}@{ref}/{path}",
    "https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}",
  ];
  let fallback = "";
  for (const template of templates) {
    const candidate = template
      .replace("{owner}", owner)
      .replace("{repo}", repo)
      .replace("{ref}", ref)
      .replace("{path}", encodedPath);
    if (!fallback) fallback = candidate;
    try {
      const head = await fetch(candidate, { method: "HEAD", signal: AbortSignal.timeout(8000) });
      if (head.ok) return candidate;
    } catch {
      /* 试下一个镜像 */
    }
  }
  return fallback;
}

async function uploadImageFile(absPath) {
  const buffer = await fs.readFile(absPath);
  const mime = mimeFromExt(path.extname(absPath));
  const fileName = path.basename(absPath);
  if (settings.uploadProvider === "custom") return uploadToCustom(buffer, fileName, mime);
  if (settings.uploadProvider === "github") return uploadToGithub(buffer, fileName, mime);
  return uploadToWechat(buffer, fileName, mime);
}

/* ---------------------------------------------------------------- helpers */

function assertInside(target) {
  if (!state.root) throw new Error("尚未打开工作区");
  const abs = path.resolve(target);
  const rel = path.relative(state.root, abs);
  const inside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  if (!inside) throw new Error("路径超出工作区范围：" + abs);
  return abs;
}

function assertValidName(name) {
  for (const ch of ILLEGAL_NAME_CHARS) {
    if (name.includes(ch)) throw new Error('名称不能包含这些字符：/ : * ? " < > | 或反斜杠');
  }
}

function isWebUrl(value) {
  const text = String(value || "");
  return text.indexOf("http://") === 0 || text.indexOf("https://") === 0;
}

async function scanDir(dir, depth) {
  const out = [];
  if (depth > 14) return out;
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      out.push({ name, path: full, type: "dir", children: await scanDir(full, depth + 1) });
    } else if (entry.isFile()) {
      const ext = path.extname(name).toLowerCase();
      if (SKIP_FILE_EXT.has(ext)) continue;
      let size = 0;
      try {
        size = (await fs.stat(full)).size;
      } catch {
        size = 0;
      }
      out.push({
        name,
        path: full,
        type: "file",
        size,
        markdown: MD_EXT.has(ext),
        image: IMAGE_EXT.has(ext),
      });
    }
  }
  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true });
  });
  return out;
}

function startWatch() {
  stopWatch();
  if (!state.root) return;
  try {
    state.watcher = fsSync.watch(state.root, { recursive: true }, (_event, file) => {
      if (!file) return;
      if (String(file).startsWith(".git")) return;
      broadcast("workspace:changed", { file: String(file) });
    });
  } catch {
    state.watcher = null;
  }
}

function stopWatch() {
  if (state.watcher) {
    try {
      state.watcher.close();
    } catch {
      /* ignore */
    }
    state.watcher = null;
  }
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

async function openRoot(rootPath) {
  const abs = path.resolve(rootPath);
  const stat = await fs.stat(abs);
  if (!stat.isDirectory()) throw new Error("不是文件夹：" + abs);
  state.root = abs;
  startWatch();
  return { root: abs, tree: await scanDir(abs, 0) };
}

/* ------------------------------------------------------------------- ipc  */

function registerIpc() {
  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    platform: process.platform,
    smokeRoot: SMOKE_ROOT,
    smokeFile: SMOKE_FILE,
    root: state.root,
  }));

  ipcMain.handle("workspace:open", async () => {
    const res = await dialog.showOpenDialog(state.win, {
      title: "选择文件夹作为工作区",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "打开",
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return openRoot(res.filePaths[0]);
  });

  ipcMain.handle("workspace:load", async (_e, rootPath) => openRoot(rootPath));

  ipcMain.handle("workspace:refresh", async () => {
    if (!state.root) return null;
    return { root: state.root, tree: await scanDir(state.root, 0) };
  });

  ipcMain.handle("fs:read", async (_e, filePath) => {
    const abs = assertInside(filePath);
    const content = await fs.readFile(abs, "utf8");
    const stat = await fs.stat(abs);
    return { path: abs, content, mtime: stat.mtimeMs };
  });

  ipcMain.handle("fs:write", async (_e, payload) => {
    const abs = assertInside(payload.path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, String(payload.content ?? ""), "utf8");
    const stat = await fs.stat(abs);
    return { path: abs, mtime: stat.mtimeMs };
  });

  ipcMain.handle("fs:create", async (_e, payload) => {
    const base = assertInside(payload.dir);
    let finalName = String(payload.name || "").trim();
    if (!finalName) throw new Error("名称不能为空");
    assertValidName(finalName);
    if (payload.kind === "file" && !path.extname(finalName)) finalName += ".md";
    const target = path.join(base, finalName);
    assertInside(target);
    if (fsSync.existsSync(target)) throw new Error("同名文件或文件夹已存在");
    if (payload.kind === "dir") {
      await fs.mkdir(target, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, "", "utf8");
    }
    return { path: target, kind: payload.kind, name: finalName };
  });

  ipcMain.handle("fs:rename", async (_e, payload) => {
    const abs = assertInside(payload.path);
    const newName = String(payload.name || "").trim();
    if (!newName) throw new Error("名称不能为空");
    assertValidName(newName);
    const target = path.join(path.dirname(abs), newName);
    assertInside(target);
    if (fsSync.existsSync(target)) throw new Error("同名文件或文件夹已存在");
    await fs.rename(abs, target);
    return { path: target, oldPath: abs, name: newName };
  });

  ipcMain.handle("fs:move", async (_e, payload) => {
    const absSrc = assertInside(payload.path);
    const absDir = assertInside(payload.dir);
    const target = path.join(absDir, path.basename(absSrc));
    assertInside(target);
    if (target === absSrc) return { path: absSrc };
    if (fsSync.existsSync(target)) throw new Error("目标位置已存在同名项目");
    if (absDir.startsWith(absSrc + path.sep)) throw new Error("不能移动到自身内部");
    await fs.rename(absSrc, target);
    return { path: target, oldPath: absSrc };
  });

  ipcMain.handle("fs:delete", async (_e, filePath) => {
    const abs = assertInside(filePath);
    await shell.trashItem(abs);
    return { path: abs };
  });

  ipcMain.handle("fs:reveal", async (_e, filePath) => {
    shell.showItemInFolder(path.resolve(filePath));
    return true;
  });

  ipcMain.handle("shell:open-external", async (_e, url) => {
    if (!isWebUrl(url)) return false;
    await shell.openExternal(String(url));
    return true;
  });

  ipcMain.handle("clipboard:write-html", async (_e, payload) => {
    clipboard.write({ text: String(payload.text || ""), html: String(payload.html || "") });
    return true;
  });

  ipcMain.handle("clipboard:write-text", async (_e, text) => {
    clipboard.writeText(String(text || ""));
    return true;
  });

  ipcMain.handle("clipboard:read-text", async () => clipboard.readText());

  ipcMain.handle("export:html", async (_e, payload) => {
    const res = await dialog.showSaveDialog(state.win, {
      title: "导出 HTML",
      defaultPath: payload.defaultName || "document.html",
      filters: [{ name: "HTML 文件", extensions: ["html"] }],
    });
    if (res.canceled || !res.filePath) return null;
    await fs.writeFile(res.filePath, String(payload.html || ""), "utf8");
    return res.filePath;
  });

  ipcMain.handle("settings:get", async () => settings);

  ipcMain.handle("settings:set", async (_e, patch) => persistSettings(patch));

  // 粘贴/拖入图片：落到工作区的图片目录，返回相对当前文档的路径
  ipcMain.handle("image:save", async (_e, payload) => {
    if (!state.root) throw new Error("请先打开一个文件夹工作区，图片需要保存到项目内");
    const buffer = Buffer.isBuffer(payload.buffer)
      ? payload.buffer
      : Buffer.from(new Uint8Array(payload.buffer));
    if (buffer.length === 0) throw new Error("图片内容为空");
    if (buffer.length > 20 * 1024 * 1024) throw new Error("图片超过 20MB，请压缩后再粘贴");

    const docAbs = payload.docPath ? assertInside(payload.docPath) : path.join(state.root, "untitled.md");
    const docDir = path.dirname(docAbs);
    const imageDir = String(settings.imageDir || "assets")
      .replace(/^[.\\/]+/, "")
      .replace(/[\\/]+$/, "") || "assets";
    const targetDir = path.join(state.root, imageDir);
    assertInside(targetDir);
    await fs.mkdir(targetDir, { recursive: true });

    const stamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14);
    const rand = Math.random().toString(36).slice(2, 7);
    const fileName = "img-" + stamp + "-" + rand + extFromType(payload.type, payload.name);
    const abs = path.join(targetDir, fileName);
    await fs.writeFile(abs, buffer);
    const rel = path.relative(docDir, abs).split(path.sep).join("/");
    return { path: abs, rel, name: fileName, size: buffer.length };
  });

  // 复制到公众号前，把本地图片上传成公网地址
  ipcMain.handle("image:upload", async (_e, payload) => {
    const map = {};
    const errors = [];
    const srcs = Array.isArray(payload && payload.srcs) ? payload.srcs : [];
    const provider = settings.uploadProvider || "none";
    if (provider === "none") {
      return { map, errors: srcs.length > 0 ? ["未启用图床，图片会保留本地路径"] : [], uploaded: 0 };
    }
    let uploaded = 0;
    for (const src of srcs) {
      try {
        const abs = localPathFromSrc(src);
        if (!abs) continue;
        assertInside(abs);
        const stat = await fs.stat(abs);
        const key = abs + "|" + stat.mtimeMs + "|" + stat.size + "|" + provider;
        if (uploadCache[key]) {
          map[src] = uploadCache[key];
          continue;
        }
        const url = await uploadImageFile(abs);
        uploadCache[key] = url;
        map[src] = url;
        uploaded += 1;
      } catch (error) {
        errors.push(path.basename(String(src)) + "：" + String((error && error.message) || error));
      }
    }
    if (uploaded > 0) await persistUploadCache();
    return { map, errors, uploaded };
  });

  ipcMain.handle("net:public-ip", async () => {
    const samples = await sampleEgressIps(3);
    const distinct = Array.from(new Set(samples));
    return { samples, distinct, stable: distinct.length <= 1, ip: distinct[0] || "" };
  });

  // 渲染层图片加载失败时，用主进程兜底定位真实文件
  ipcMain.handle("images:resolve", async (_e, payload) => {
    const docPath = payload && payload.docPath ? String(payload.docPath) : "";
    const resolved = await resolveImagePath(docPath, payload && payload.src);
    return resolved ? { path: resolved } : null;
  });

  ipcMain.handle("image:test-upload", async () => {
    try {
      const url =
        settings.uploadProvider === "custom"
          ? await uploadToCustom(TINY_PNG, "mdmaster-test.png", "image/png")
          : await uploadToWechat(TINY_PNG, "mdmaster-test.png", "image/png");
      return { ok: true, url };
    } catch (error) {
      return { ok: false, error: String((error && error.message) || error) };
    }
  });
}

/* ---------------------------------------------------------------- window */

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: "#1b1d21",
    title: "MDMaster",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  state.win = win;

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  win.once("ready-to-show", () => {
    if (!SMOKE_OUT || SHOTS_DIR || process.env.MDMaster_SMOKE_SHOW) win.showInactive();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const isF12 = input.key === "F12";
    const isDevtools = input.control && input.shift && input.key.toLowerCase() === "i";
    if (isF12 || isDevtools) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.webContents.on("console-message", (event) => {
    const levels = ["debug", "info", "warning", "error"];
    state.logs.push({
      level: levels[event.level] || "log",
      message: event.message,
      line: event.lineNumber,
      source: event.sourceId,
    });
  });

  let closing = false;
  win.on("close", (event) => {
    if (closing) return;
    event.preventDefault();
    const finish = () => {
      if (closing) return;
      closing = true;
      win.destroy();
    };
    const timer = setTimeout(finish, 600);
    ipcMain.once("app:flushed", () => {
      clearTimeout(timer);
      finish();
    });
    try {
      win.webContents.send("app:flush");
    } catch {
      clearTimeout(timer);
      finish();
    }
  });

  win.on("closed", () => {
    if (state.win === win) state.win = null;
  });

  if (process.env.MDMaster_DEBUG_IMAGES) runImageDebug(win);
  else if (SHOTS_DIR) runShots(win);
  else if (SMOKE_OUT) runSmoke();

  return win;
}

/* --------------------------------------------------- 网络图片缓存与定位 */

const IMAGE_CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const remoteInflight = new Map();
let imageIndexCache = { root: "", at: 0, map: new Map() };

const imageCacheDir = () => path.join(app.getPath("userData"), "image-cache");

function imageCacheKey(url) {
  return crypto.createHash("sha1").update(url).digest("hex");
}

/**
 * 远程图片统一由主进程下载并缓存到本地。
 * 关键点：Node 的 fetch 不读取 Windows 系统代理，而 Chromium 会，
 * 因此当系统代理无法访问图片主机时，走这里反而能正常显示，且二次打开不再依赖网络。
 */
async function serveRemoteImage(rawUrl) {
  if (!/^https?:\/\//i.test(rawUrl)) return new Response("bad url", { status: 400 });
  const dir = imageCacheDir();
  const key = imageCacheKey(rawUrl);
  const dataPath = path.join(dir, key + ".bin");
  const metaPath = path.join(dir, key + ".json");

  try {
    const stat = await fs.stat(dataPath);
    if (Date.now() - stat.mtimeMs < IMAGE_CACHE_TTL_MS) {
      const body = await fs.readFile(dataPath);
      let contentType = "image/png";
      try {
        contentType = JSON.parse(await fs.readFile(metaPath, "utf8")).contentType || contentType;
      } catch {
        /* 忽略 */
      }
      return new Response(body, { headers: { "content-type": contentType, "cache-control": "max-age=600" } });
    }
  } catch {
    /* 未命中，继续下载 */
  }

  if (remoteInflight.has(key)) return remoteInflight.get(key);

  const task = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(rawUrl, { signal: controller.signal, redirect: "follow" });
      if (!response.ok) return new Response("upstream " + response.status, { status: 502 });
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "image/png";
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(dataPath, buffer);
      await fs.writeFile(metaPath, JSON.stringify({ url: rawUrl, contentType, savedAt: Date.now() }), "utf8");
      return new Response(buffer, { headers: { "content-type": contentType } });
    } catch (error) {
      return new Response("fetch failed: " + String((error && error.message) || error), { status: 502 });
    } finally {
      clearTimeout(timer);
      remoteInflight.delete(key);
    }
  })();

  remoteInflight.set(key, task);
  return task;
}

/** 工作区内图片文件名索引，用于相对路径找不到时的兜底定位 */
async function workspaceImageIndex() {
  const now = Date.now();
  if (imageIndexCache.root === state.root && now - imageIndexCache.at < 8000) return imageIndexCache.map;
  const map = new Map();
  const walk = async (dir, depth) => {
    if (depth > 8) return;
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full, depth + 1);
      } else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) {
        const key = entry.name.toLowerCase();
        if (!map.has(key)) map.set(key, full);
      }
    }
  };
  if (state.root) await walk(state.root, 0);
  imageIndexCache = { root: state.root, at: now, map };
  return map;
}

function decodePathSafe(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** 依次尝试「原样 / 解码后 / 解析后」的路径，最后按文件名在工作区兜底 */
async function findImageFile(candidatePath) {
  if (!candidatePath) return null;
  const variants = [];
  const push = (value) => {
    if (value && !variants.includes(value)) variants.push(value);
  };
  push(candidatePath);
  push(decodePathSafe(candidatePath));
  push(path.resolve(candidatePath));
  for (const variant of variants) {
    try {
      const stat = await fs.stat(variant);
      if (stat.isFile()) return variant;
    } catch {
      /* 继续尝试 */
    }
  }
  const base = path.basename(decodePathSafe(candidatePath)).toLowerCase();
  if (base && base !== "." && state.root) {
    const index = await workspaceImageIndex();
    const hit = index.get(base);
    if (hit) return hit;
  }
  return null;
}

/** 记录图片解析失败，便于事后定位（%APPDATA%\MDMaster\image-errors.log） */
async function logImageError(payload) {
  try {
    const file = path.join(app.getPath("userData"), "image-errors.log");
    await fs.appendFile(file, new Date().toISOString() + " " + JSON.stringify(payload) + "\n", "utf8");
  } catch {
    /* 忽略 */
  }
}

/** 把 Markdown 里写的图片地址解析成真实存在的绝对路径 */
async function resolveImagePath(docPath, src) {
  const raw = String(src || "").trim();
  if (!raw || /^(https?:|data:|mdlocal:)/i.test(raw)) return null;
  const cleaned = decodePathSafe(raw.replace(/^file:\/{2,3}/i, "").replace(/\\/g, "/"));
  const candidates = [];
  if (/^[A-Za-z]:\//.test(cleaned) || cleaned.startsWith("//")) {
    candidates.push(path.resolve(cleaned));
  } else if (cleaned.startsWith("/")) {
    candidates.push(path.resolve(cleaned.slice(1)));
  } else if (!cleaned.startsWith("..")) {
    if (docPath) candidates.push(path.resolve(path.dirname(docPath), cleaned));
    if (state.root) candidates.push(path.resolve(state.root, cleaned));
  } else {
    if (docPath) candidates.push(path.resolve(path.dirname(docPath), cleaned));
    if (state.root) candidates.push(path.resolve(state.root, cleaned));
  }
  for (const candidate of candidates) {
    const found = await findImageFile(candidate);
    if (found) return found;
  }
  await logImageError({ stage: "resolve", src: raw, docPath: docPath || "", root: state.root || "", candidates });
  return null;
}

/* 图片诊断：逐张检查预览区图片的加载状态与 mdlocal 协议响应（MDMaster_DEBUG_IMAGES=<报告路径>） */
async function runImageDebug(win) {
  const out = path.resolve(process.env.MDMaster_DEBUG_IMAGES);
  await delay(SMOKE_WAIT);
  try {
    const report = await win.webContents.executeJavaScript(
      "(async () => {" +
        "  const imgs = Array.from(document.querySelectorAll('.preview-article img'));" +
        "  const rows = [];" +
        "  for (const img of imgs) {" +
        "    const src = img.getAttribute('src') || '';" +
        "    const next = img.nextElementSibling;" +
        "    rows.push({ orig: img.getAttribute('data-orig') || '', src: src.slice(0, 120), complete: img.complete, w: img.naturalWidth, dataError: img.getAttribute('data-error'), hint: next && next.className === 'img-broken-hint' ? next.textContent : null });" +
        "  }" +
        "  const info = await window.mdmaster.info();" +
        "  return { root: info.root, count: imgs.length, rows };" +
        "})()"
    );
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, JSON.stringify(report, null, 2), "utf8");
  } catch (error) {
    try {
      await fs.writeFile(out, JSON.stringify({ error: String((error && error.stack) || error) }, null, 2), "utf8");
    } catch {
      /* ignore */
    }
  } finally {
    app.exit(0);
  }
}

/* 为软著说明书采集界面截图（仅在设置 MDMaster_SHOTS_DIR 时运行） */
async function runShots(win) {
  const dir = path.resolve(SHOTS_DIR);
  await fs.mkdir(dir, { recursive: true });
  const js = (code) => win.webContents.executeJavaScript(code);
  const snap = async (name, wait) => {
    await delay(wait === undefined ? 520 : wait);
    const image = await win.webContents.capturePage();
    await fs.writeFile(path.join(dir, name), image.toPNG());
    return name;
  };

  await delay(SMOKE_WAIT);
  try {
    // 1. 主界面
    await snap("01-overview.png", 600);

    // 2. 文件管理（右键菜单）
    await js(
      '(() => { const n = Array.from(document.querySelectorAll(".tree-file")).find((e) => e.textContent.indexOf("公众号排版指南") >= 0); if (!n) return false; n.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 250, clientY: 340 })); return true; })()'
    );
    await snap("02-files.png", 450);
    await js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");

    // 3. 编辑区（代码块与表格文档）
    await js(
      '(() => { const tab = Array.from(document.querySelectorAll("[data-tab]")).find((t) => t.textContent.indexOf("代码块与表格") >= 0); if (!tab) return false; tab.click(); return true; })()'
    );
    await delay(600);
    await js(
      '(() => { const sc = document.querySelector(".cm-scroller"); if (!sc) return false; sc.scrollTop = 420; sc.dispatchEvent(new Event("scroll")); return true; })()'
    );
    await snap("03-editor.png", 600);

    // 4. 实时预览与目录联动
    await js(
      '(() => { const tab = Array.from(document.querySelectorAll("[data-tab]")).find((t) => t.textContent.indexOf("欢迎使用") >= 0); if (!tab) return false; tab.click(); return true; })()'
    );
    await delay(700);
    await js(
      '(() => { const sc = document.querySelector(".preview-scroll"); if (!sc) return false; sc.scrollTop = 780; sc.dispatchEvent(new Event("scroll")); return true; })()'
    );
    await snap("04-preview.png", 700);

    // 5. 图片与图注
    await js(
      '(() => { const n = Array.from(document.querySelectorAll(".tree-file")).find((e) => e.textContent.indexOf("图片与链接") >= 0); if (!n) return false; n.click(); return true; })()'
    );
    await delay(900);
    await snap("05-images.png", 500);

    // 6. 复制到公众号
    await js('window.mdmaster.settings.set({ uploadProvider: "none" })');
    await delay(200);
    await js(
      '(() => { const btn = Array.from(document.querySelectorAll(".topbar-actions button")).find((b) => b.textContent.indexOf("复制") >= 0); if (!btn) return false; btn.click(); return true; })()'
    );
    await snap("06-copy.png", 900);

    // 7. 设置
    await js('(() => { const b = document.querySelector(".topbar-actions .icon-button"); if (!b) return false; b.click(); return true; })()');
    await snap("07-settings.png", 700);
    await js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await delay(300);

    // 8. 快捷键面板
    await js(
      '(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "/", ctrlKey: true, bubbles: true })); return true; })()'
    );
    await snap("08-shortcuts.png", 700);
  } catch (error) {
    try {
      await fs.writeFile(path.join(dir, "error.txt"), String((error && error.stack) || error), "utf8");
    } catch {
      /* ignore */
    }
  } finally {
    app.exit(0);
  }
}

async function runSmoke() {
  await new Promise((resolve) => setTimeout(resolve, SMOKE_WAIT));
  try {
    const win = state.win;
    if (!win) throw new Error("no window");
    const probe = await win.webContents.executeJavaScript(
      "(() => {" +
        'const root = document.getElementById("root");' +
        "return {" +
        "mounted: !!root && root.childElementCount > 0," +
        'blocks: document.querySelectorAll("[data-line]").length,' +
        'headings: document.querySelectorAll("[data-line][data-heading]").length,' +
        'treeNodes: document.querySelectorAll("[data-tree-path]").length,' +
        'tabs: document.querySelectorAll("[data-tab]").length,' +
        'tocItems: document.querySelectorAll("[data-toc-line]").length,' +
        'previewHtml: (document.querySelector(".preview-article") || {}).innerHTML ? "yes" : "no",' +
        'bodyText: (document.body.innerText || "").slice(0, 300)' +
        "};})()"
    );
    const image = await win.webContents.capturePage();
    await fs.mkdir(path.dirname(SMOKE_OUT), { recursive: true });
    await fs.writeFile(SMOKE_OUT, image.toPNG());
    const checks = await runSmokeChecks(win);
    await fs.writeFile(
      SMOKE_OUT.replace(/\.png$/, "") + ".json",
      JSON.stringify({ probe, checks, logs: state.logs }, null, 2),
      "utf8"
    );
  } catch (error) {
    try {
      await fs.writeFile(
        SMOKE_OUT.replace(/\.png$/, "") + ".json",
        JSON.stringify({ error: String((error && error.stack) || error), logs: state.logs }, null, 2),
        "utf8"
      );
    } catch {
      /* ignore */
    }
  } finally {
    app.exit(0);
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runSmokeChecks(win) {
  const checks = [];
  const run = async (name, script) => {
    try {
      const value = await win.webContents.executeJavaScript(script);
      checks.push({ name, ok: Boolean(value), value });
    } catch (error) {
      checks.push({ name, ok: false, value: String((error && error.message) || error) });
    }
  };
  const pressBody = async (key, extra) => {
    const spec = Object.assign({ key, bubbles: true, cancelable: true }, extra || {});
    await win.webContents.executeJavaScript(
      "document.body.dispatchEvent(new KeyboardEvent('keydown', " + JSON.stringify(spec) + "))"
    );
    await delay(260);
  };
  const pressEscape = async () => {
    await win.webContents.executeJavaScript(
      "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"
    );
    await delay(200);
  };

  // 预览 -> 编辑器 滚动联动
  await win.webContents.executeJavaScript(
    '(() => { const el = document.querySelector(".preview-scroll"); el.scrollTop = 900; el.dispatchEvent(new Event("scroll")); return true; })()'
  );
  await delay(400);
  await run(
    "预览滚动带动编辑器",
    'Number((document.querySelector(".cm-scroller") || {}).scrollTop || 0) > 200'
  );

  // 编辑器 -> 预览 滚动联动
  await win.webContents.executeJavaScript(
    '(() => { const el = document.querySelector(".cm-scroller"); el.scrollTop = 1200; el.dispatchEvent(new Event("scroll")); return true; })()'
  );
  await delay(400);
  await run(
    "编辑器滚动带动预览",
    'Number((document.querySelector(".preview-scroll") || {}).scrollTop || 0) > 200'
  );

  // 快捷键：Ctrl+B 加粗（走 window 级快捷键 + 编辑器命令）
  await run(
    "Ctrl+B 插入加粗标记",
    '(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true })); return (document.querySelector(".cm-content") || {}).innerText ? document.querySelector(".cm-content").innerText.includes("**") : false; })()'
  );

  // 目录跳转
  await run(
    "目录点击跳转",
    '(() => { const item = document.querySelector("[data-toc-line]"); if (!item) return false; item.click(); return true; })()'
  );
  await delay(300);

  // 自动保存：等待防抖后状态栏显示已保存
  await delay(1600);
  await run(
    "自动保存生效",
    '(() => { const save = document.querySelector(".status-save"); const toast = document.querySelector(".toast"); return save && save.textContent === "已保存" ? true : JSON.stringify({ save: save && save.textContent, cls: save && save.className, toast: toast && toast.textContent }); })()'
  );

  // 复制到公众号：点击按钮后读取系统剪贴板
  await win.webContents.executeJavaScript(
    '(() => { const btn = Array.from(document.querySelectorAll(".topbar-actions button")).find((b) => b.textContent.includes("复制到公众号")); if (!btn) return false; btn.click(); return true; })()'
  );
  await delay(700);
  let clipHtml = "";
  try {
    clipHtml = clipboard.readHTML();
  } catch {
    clipHtml = "";
  }
  try {
    await fs.writeFile(SMOKE_OUT.replace(/\.png$/, "") + "-clip.html", clipHtml, "utf8");
  } catch {
    /* ignore */
  }
  const dataLineAt = clipHtml.indexOf("data-line");
  const hljsClassAt = clipHtml.indexOf('class="hljs');
  checks.push({
    name: "复制到公众号（系统剪贴板为富文本 HTML）",
    ok:
      clipHtml.length > 500 &&
      clipHtml.indexOf("<section") >= 0 &&
      clipHtml.indexOf("style=") >= 0 &&
      dataLineAt === -1 &&
      hljsClassAt === -1,
    value: {
      length: clipHtml.length,
      dataLineAt,
      dataLineContext: dataLineAt >= 0 ? clipHtml.slice(Math.max(0, dataLineAt - 90), dataLineAt + 40) : "",
      hljsClassAt,
      tail: clipHtml.slice(-160),
    },
  });

  // 主题切换
  await run(
    "切换主题后重绘",
    '(() => { const select = document.querySelector(".theme-select"); if (!select) return false; select.value = "ocean"; select.dispatchEvent(new Event("change", { bubbles: true })); return true; })()'
  );
  await delay(300);
  await run(
    "主题样式已应用",
    '(() => { const h2 = document.querySelector("[data-heading] h2, h2[data-heading]"); return !!h2 && (h2.getAttribute("style") || "").indexOf("#2563eb") >= 0; })()'
  );

  await run(
    "工具栏在默认窗口下不溢出",
    '(() => { const bar = document.querySelector(".toolbar-scroll"); if (!bar) return false; return bar.scrollWidth - bar.clientWidth <= 1 ? true : JSON.stringify({ scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth }); })()'
  );

  let imageOk = false;
  let imageInfo = "";
  for (let attempt = 0; attempt < 10 && !imageOk; attempt += 1) {
    const info = await win.webContents.executeJavaScript(
      '(() => { const images = Array.from(document.querySelectorAll(".preview-article img")); const used = images.find((img) => (img.getAttribute("src") || "").indexOf("mdlocal:") === 0); if (!used) return { found: false, total: images.length }; return { found: true, src: used.getAttribute("src"), w: used.naturalWidth }; })()'
    );
    imageOk = Boolean(info && info.found && info.w > 0);
    imageInfo = JSON.stringify(info);
    if (!imageOk) await delay(250);
  }
  checks.push({ name: "预览可加载本地图片", ok: imageOk, value: imageInfo });

  // 预览：图片图注
  await run(
    "预览显示图片图注",
    'Array.from(document.querySelectorAll(".preview-article span")).some((s) => s.textContent.trim() === "示意图")'
  );
  try {
    const clipAgain = clipboard.readHTML();
    checks.push({
      name: "复制版 HTML 保留图片图注",
      ok: clipAgain.indexOf("display:block") >= 0 && clipAgain.indexOf("示意图</span>") >= 0,
      value: { len: clipAgain.length },
    });
  } catch (error) {
    checks.push({ name: "复制版 HTML 保留图片图注", ok: false, value: String(error) });
  }

  // 预览内链锚点跳转
  await win.webContents.executeJavaScript(
    '(() => { const sc = document.querySelector(".preview-scroll"); if (sc) sc.scrollTop = 0; const heads = Array.from(document.querySelectorAll(".preview-article [data-heading]")); const last = heads[heads.length - 1]; if (!last) return false; const a = document.createElement("a"); a.href = "#" + last.id; a.textContent = "jump"; a.style.position = "absolute"; document.querySelector(".preview-article").appendChild(a); a.click(); a.remove(); return true; })()'
  );
  await delay(600);
  await run("预览内链锚点可跳转", 'Number((document.querySelector(".preview-scroll") || {}).scrollTop || 0) > 300');

  // 顶栏：文件栏收起后必须还能重新打开（用户反馈）
  await run("顶栏有“文件栏”开关", '!!Array.from(document.querySelectorAll(".topbar-nav button")).find((b) => b.textContent.indexOf("文件栏") >= 0)');
  await run("顶栏有“打开文件夹”按钮", '!!Array.from(document.querySelectorAll(".topbar-nav button")).find((b) => b.textContent.indexOf("打开文件夹") >= 0)');
  await win.webContents.executeJavaScript(
    '(() => { const btn = Array.from(document.querySelectorAll(".topbar-nav button")).find((b) => b.textContent.indexOf("文件栏") >= 0); if (!btn) return false; btn.click(); return true; })()'
  );
  await delay(300);
  await run("点击后文件栏收起", '!document.querySelector(".sidebar-wrap")');
  await win.webContents.executeJavaScript(
    '(() => { const btn = Array.from(document.querySelectorAll(".topbar-nav button")).find((b) => b.textContent.indexOf("文件栏") >= 0); if (!btn) return false; btn.click(); return true; })()'
  );
  await delay(300);
  await run("顶栏按钮可重新打开文件栏", '!!document.querySelector(".sidebar-wrap")');

  // 设置弹窗 + 设置持久化
  await win.webContents.executeJavaScript(
    '(() => { const btn = document.querySelector(".topbar-actions .icon-button"); if (!btn) return false; btn.click(); return true; })()'
  );
  await delay(300);
  await run("设置弹窗可打开", '!!document.querySelector(".settings-section") && !!document.querySelector(".settings-section select")');
  try {
    const settingsShot = await win.webContents.capturePage();
    await fs.writeFile(SMOKE_OUT.replace(/\.png$/, "") + "-settings.png", settingsShot.toPNG());
  } catch {
    /* 忽略 */
  }
  await pressEscape();
  await run("设置弹窗可关闭", '!document.querySelector(".settings-section")');
  await win.webContents.executeJavaScript('window.mdmaster.settings.set({ imageDir: "images" })');
  await delay(200);
  await run("设置写入并可读回", 'window.mdmaster.settings.get().then((s) => s.imageDir === "images")');
  await win.webContents.executeJavaScript('window.mdmaster.settings.set({ imageDir: "assets" })');

  // 图床上传：本地起一个假图床接口，验证复制时把本地图片换成公网地址
  const http = require("node:http");
  let uploadCount = 0;
  const fakeHost = http.createServer((req, res) => {
    req.on("data", () => undefined);
    req.on("end", () => {
      uploadCount += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0, data: { url: "https://smoke.local/img-" + uploadCount + ".png" } }));
    });
  });
  await new Promise((resolve) => fakeHost.listen(0, "127.0.0.1", resolve));
  const fakePort = fakeHost.address().port;
  await win.webContents.executeJavaScript(
    'window.mdmaster.settings.set({ uploadProvider: "custom", customUploadUrl: "http://127.0.0.1:' +
      fakePort +
      '/upload", customFieldName: "file", customUrlPath: "data.url" })'
  );
  await delay(200);
  await win.webContents.executeJavaScript(
    '(() => { const btn = Array.from(document.querySelectorAll(".topbar-actions button")).find((b) => b.textContent.indexOf("复制到公众号") >= 0); if (!btn) return false; btn.click(); return true; })()'
  );
  await delay(1600);
  let uploadHtml = "";
  try {
    uploadHtml = clipboard.readHTML();
  } catch {
    uploadHtml = "";
  }
  const uploadToast = await win.webContents.executeJavaScript(
    '((document.querySelector(".toast") || {}).textContent || "")'
  );
  checks.push({
    name: "复制到公众号时本地图片自动上传为公网地址",
    ok:
      uploadHtml.indexOf("https://smoke.local/img-") >= 0 &&
      uploadHtml.indexOf("mdlocal:") === -1 &&
      String(uploadToast).indexOf("已上传") >= 0,
    value: { uploads: uploadCount, toast: uploadToast, hasPublicUrl: uploadHtml.indexOf("https://smoke.local/img-") >= 0 },
  });
  fakeHost.close();
  await win.webContents.executeJavaScript('window.mdmaster.settings.set({ uploadProvider: "none" })');

  // 粘贴图片：自动落盘到 assets 并插入 Markdown
  await win.webContents.executeJavaScript(
    '(() => { const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="; const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i); const dt = new DataTransfer(); dt.items.add(new File([bytes], "paste-test.png", { type: "image/png" })); const target = document.querySelector(".cm-content"); if (!target) return false; target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); return true; })()'
  );
  await delay(1300);
  await run(
    "粘贴图片自动插入 Markdown 引用",
    '(() => { const text = (document.querySelector(".cm-content") || {}).innerText || ""; return text.indexOf("assets/img-") >= 0; })()'
  );
  let pasted = [];
  try {
    pasted = (await fs.readdir(path.join(state.root, "assets"))).filter((name) => name.startsWith("img-"));
  } catch {
    pasted = [];
  }
  checks.push({ name: "粘贴的图片保存到本地 assets 目录", ok: pasted.length > 0, value: pasted.slice(0, 3) });

  // 快速跳转面板
  await pressBody("p", { ctrlKey: true });
  await run("Ctrl+P 打开快速跳转", '!!document.querySelector(".palette")');
  await pressEscape();
  await run("Esc 关闭快速跳转", '!document.querySelector(".palette")');

  // 快捷键面板
  await pressBody("/", { ctrlKey: true });
  await run("Ctrl+/ 打开快捷键面板", '!!document.querySelector(".modal.is-wide")');
  await pressEscape();

  // 视图模式循环
  await pressBody("v", { ctrlKey: true, shiftKey: true });
  await run("Ctrl+Shift+V 切到纯编辑（无预览）", 'document.querySelectorAll(".preview-pane").length === 0');
  await pressBody("v", { ctrlKey: true, shiftKey: true });
  await pressBody("v", { ctrlKey: true, shiftKey: true });
  await run("再切回分屏", 'document.querySelectorAll(".preview-pane").length === 1 && document.querySelectorAll(".editor-pane").length === 1');

  // 侧边栏开关
  await pressBody("b", { ctrlKey: true, altKey: true });
  await run("Ctrl+Alt+B 隐藏文件栏", '!document.querySelector(".sidebar-wrap")');
  await pressBody("b", { ctrlKey: true, altKey: true });
  await run("Ctrl+Alt+B 恢复文件栏", '!!document.querySelector(".sidebar-wrap")');

  // 目录面板开关
  await pressBody("o", { ctrlKey: true, altKey: true });
  await run("Ctrl+Alt+O 隐藏目录", '!document.querySelector(".toc-pane")');
  await pressBody("o", { ctrlKey: true, altKey: true });
  await run("Ctrl+Alt+O 恢复目录", '!!document.querySelector(".toc-pane")');

  // 文件夹折叠
  const filesBefore = await win.webContents.executeJavaScript('document.querySelectorAll(".tree-file").length');
  await win.webContents.executeJavaScript(
    '(() => { const dir = document.querySelector(".tree-dir"); if (!dir) return false; dir.click(); return true; })()'
  );
  await delay(300);
  await run(
    "点击文件夹可折叠",
    'document.querySelectorAll(".tree-file").length < ' + filesBefore
  );

  // 打开另一个文档
  await win.webContents.executeJavaScript(
    '(() => { const nodes = Array.from(document.querySelectorAll(".tree-file")); const target = nodes.find((n) => n.textContent.indexOf("公众号排版指南") >= 0); if (!target) return false; target.click(); return true; })()'
  );
  await delay(500);
  await run("点击文件在新标签打开", 'document.querySelectorAll("[data-tab]").length === 3');

  // 新建文档（走真实 IPC：创建文件 + 刷新 + 打开）
  await win.webContents.executeJavaScript(
    '(() => { const btn = Array.from(document.querySelectorAll(".sidebar-actions .icon-button")).find((b) => (b.title || "").indexOf("新建文档") >= 0); if (!btn) return false; btn.click(); return true; })()'
  );
  await delay(300);
  await run("新建文档弹窗出现", '!!document.querySelector(".modal .field input")');
  await win.webContents.executeJavaScript(
    '(() => { const input = document.querySelector(".modal .field input"); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(input, "冒烟测试.md"); input.dispatchEvent(new Event("input", { bubbles: true })); return true; })()'
  );
  await delay(200);
  await win.webContents.executeJavaScript(
    '(() => { const btn = document.querySelector(".modal-foot .primary-button"); if (!btn) return false; btn.click(); return true; })()'
  );
  await delay(900);
  await run(
    "新建文档写入磁盘并打开",
    'Array.from(document.querySelectorAll("[data-tab]")).some((t) => t.textContent.indexOf("冒烟测试") >= 0) && !!Array.from(document.querySelectorAll("[data-tree-path]")).find((n) => n.textContent.indexOf("冒烟测试") >= 0)'
  );

  // 拖拽移动文件到文件夹（先把文件夹展开，否则移动后的行不可见）
  const expandAll = async () => {
    await win.webContents.executeJavaScript(
      '(() => { Array.from(document.querySelectorAll(".tree-dir")).forEach((dir) => { const caret = dir.querySelector(".tree-caret"); if (!caret || !caret.classList.contains("is-open")) dir.click(); }); return true; })()'
    );
    await delay(320);
  };
  await expandAll();
  await win.webContents.executeJavaScript(
    '(() => { const src = Array.from(document.querySelectorAll(".tree-file")).find((n) => n.textContent.indexOf("公众号排版指南") >= 0); const dir = document.querySelector(".tree-dir"); if (!src || !dir) return false; const dt = new DataTransfer(); src.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true })); dir.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true })); dir.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); return true; })()'
  );
  await delay(800);
  await expandAll();
  await run(
    "拖拽文件移动到文件夹",
    'Array.from(document.querySelectorAll("[data-tree-path]")).some((n) => { const p = n.getAttribute("data-tree-path") || ""; return p.indexOf("进阶技巧") >= 0 && p.indexOf("公众号排版指南") >= 0; })'
  );

  // 右键菜单重命名
  await win.webContents.executeJavaScript(
    '(() => { const node = Array.from(document.querySelectorAll(".tree-file")).find((n) => n.textContent.indexOf("冒烟测试") >= 0); if (!node) return false; node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 320, clientY: 320 })); return true; })()'
  );
  await delay(250);
  await run("右键菜单出现", '!!document.querySelector(".context-menu")');
  await win.webContents.executeJavaScript(
    '(() => { const item = Array.from(document.querySelectorAll(".context-item")).find((b) => b.textContent === "重命名"); if (!item) return false; item.click(); return true; })()'
  );
  await delay(300);
  await win.webContents.executeJavaScript(
    '(() => { const input = document.querySelector(".modal .field input"); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(input, "已重命名.md"); input.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector(".modal-foot .primary-button").click(); return true; })()'
  );
  await delay(900);
  await run(
    "重命名同步文件树",
    'Array.from(document.querySelectorAll("[data-tree-path]")).some((n) => n.textContent.indexOf("已重命名") >= 0) && !Array.from(document.querySelectorAll("[data-tree-path]")).some((n) => n.textContent.indexOf("冒烟测试") >= 0)'
  );

  return checks;
}

/* ------------------------------------------------------------------ boot */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (state.win) {
      if (state.win.isMinimized()) state.win.restore();
      state.win.focus();
    }
  });

  app.whenReady().then(async () => {
    await loadPersistedState();
    Menu.setApplicationMenu(null);
    protocol.handle("mdlocal", async (request) => {
      try {
        const url = new URL(request.url);
        // mdlocal://remote/?u=... 会被解析成 host=remote、pathname=/
        if (url.host === "remote" || url.pathname === "/remote" || url.pathname === "/remote/") {
          return await serveRemoteImage(url.searchParams.get("u") || "");
        }
        let filePath = decodeURIComponent(url.pathname);
        if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1);
        const abs = path.resolve(filePath);
        // 路径可能被多编码了一层或文件名有出入，做一次兜底定位
        const resolved = (await findImageFile(abs)) || abs;
        const ext = path.extname(resolved).toLowerCase();
        if (state.root) {
          const rel = path.relative(state.root, resolved);
          const inside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
          // 工作区外的文件只放行图片，避免被文档读取任意本地文件
          if (!inside && !IMAGE_EXT.has(ext)) {
            return new Response("forbidden", { status: 403 });
          }
        }
        if (!fsSync.existsSync(resolved)) {
          await logImageError({ stage: "protocol", request: decodeURIComponent(url.pathname).slice(0, 300) });
          return new Response("not found", { status: 404 });
        }
        return await net.fetch(pathToFileURL(resolved).toString());
      } catch {
        return new Response("not found", { status: 404 });
      }
    });
    registerIpc();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", stopWatch);
}
