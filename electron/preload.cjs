"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("mdmaster", {
  isDesktop: true,
  info: () => invoke("app:info"),
  workspace: {
    open: () => invoke("workspace:open"),
    load: (root) => invoke("workspace:load", root),
    refresh: () => invoke("workspace:refresh"),
  },
  fs: {
    read: (path) => invoke("fs:read", path),
    write: (path, content) => invoke("fs:write", { path, content }),
    create: (dir, name, kind) => invoke("fs:create", { dir, name, kind }),
    rename: (path, name) => invoke("fs:rename", { path, name }),
    move: (path, dir) => invoke("fs:move", { path, dir }),
    remove: (path) => invoke("fs:delete", path),
    reveal: (path) => invoke("fs:reveal", path),
  },
  shell: {
    openExternal: (url) => invoke("shell:open-external", url),
  },
  clipboard: {
    writeHtml: (html, text) => invoke("clipboard:write-html", { html, text }),
    writeText: (text) => invoke("clipboard:write-text", text),
    readText: () => invoke("clipboard:read-text"),
  },
  settings: {
    get: () => invoke("settings:get"),
    set: (patch) => invoke("settings:set", patch),
  },
  images: {
    save: (payload) => invoke("image:save", payload),
    upload: (srcs) => invoke("image:upload", { srcs }),
    testUpload: () => invoke("image:test-upload"),
  },
  exportHtml: (defaultName, html) => invoke("export:html", { defaultName, html }),
  onFlushRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("app:flush", listener);
    return () => ipcRenderer.removeListener("app:flush", listener);
  },
  flushDone: () => ipcRenderer.send("app:flushed"),
  onWorkspaceChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("workspace:changed", listener);
    return () => ipcRenderer.removeListener("workspace:changed", listener);
  },
});
