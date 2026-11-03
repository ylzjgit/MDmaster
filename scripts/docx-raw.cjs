const fs = require("node:fs");
const file = process.argv[2];
const want = process.argv.slice(3).map(Number);
const xml = fs.readFileSync(file, "utf8");
const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
for (const n of want) {
  const p = paras[n - 1];
  if (!p) continue;
  console.log("===== paragraph " + n + " =====");
  console.log(p.replace(/></g, ">\n<"));
}
