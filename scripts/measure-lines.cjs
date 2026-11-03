const fs = require("node:fs");

const FILES = [
  "electron/preload.cjs",
  "electron/main.cjs",
  "index.html",
  "vite.config.ts",
  "src/main.tsx",
  "src/types.ts",
  "src/lib/bridge.ts",
  "src/lib/storage.ts",
  "src/lib/clipboard.ts",
  "src/lib/theme.ts",
  "src/lib/markdown.ts",
  "src/lib/transforms.ts",
  "src/lib/commands.ts",
  "src/lib/shortcuts.ts",
  "src/lib/scrollSync.ts",
  "src/lib/tree.ts",
  "src/App.tsx",
  "src/components/Editor.tsx",
  "src/components/Preview.tsx",
  "src/components/Toc.tsx",
  "src/components/Tabs.tsx",
  "src/components/Toolbar.tsx",
  "src/components/StatusBar.tsx",
  "src/components/Sidebar.tsx",
  "src/components/FileTree.tsx",
  "src/components/ContextMenu.tsx",
  "src/components/Dialogs.tsx",
  "src/components/CommandPalette.tsx",
  "src/components/Welcome.tsx",
  "src/components/Toast.tsx",
  "src/styles/app.css",
];

let total = 0;
const all = [];
for (const file of FILES) {
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
  total += lines.length;
  for (const line of lines) all.push({ file, line });
  console.log(String(lines.length).padStart(5), "maxlen=" + String(Math.max(...lines.map((l) => l.length))).padStart(4), file);
}
console.log("TOTAL LINES", total);

const tooLong = (n) => all.filter((item) => item.line.length > n).length;
for (const n of [80, 90, 95, 100, 105, 110, 120, 130]) {
  console.log("lines > " + n + " chars:", tooLong(n));
}
const longest = all.reduce((a, b) => (a.line.length >= b.line.length ? a : b));
console.log("longest line:", longest.line.length, "chars in", longest.file);
console.log(JSON.stringify(longest.line.slice(0, 200)));
