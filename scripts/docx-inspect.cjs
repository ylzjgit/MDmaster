const fs = require("node:fs");

const file = process.argv[2];
const limit = Number(process.argv[3] || 200);
const xml = fs.readFileSync(file, "utf8");

function pick(re, src) {
  const m = re.exec(src || "");
  if (!m) return "";
  return m[1] === undefined ? m[0] : m[1];
}

const sect = pick(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/, xml);
console.log("=== sectPr ===");
console.log(sect.replace(/></g, ">\n<").slice(0, 1500));

const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
console.log("=== paragraphs:", paras.length, "===");

let i = 0;
for (const p of paras) {
  i += 1;
  if (i > limit) break;
  const text = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("")
    .replace(/&amp;/g, "&");
  const style = pick(/<w:pStyle w:val="([^"]+)"/, p);
  const jc = pick(/<w:jc w:val="([^"]+)"/, p);
  const ind = pick(/<w:ind [^>]*\/>/, p);
  const spacing = pick(/<w:spacing [^>]*\/>/, p);
  const size = pick(/<w:sz w:val="(\d+)"/, p);
  const fonts = pick(/<w:ascii="([^"]+)"/, p) + "/" + pick(/<w:eastAsia="([^"]+)"/, p);
  const bold = /<w:b\/>/.test(p) ? "B" : "";
  const img = /<w:drawing|<w:pict/.test(p) ? "IMG" : "";
  const pgbrk = /<w:br w:type="page"\/>/.test(p) ? "PAGEBREAK" : "";
  const tbl = /<w:tbl>/.test(p) ? "TBL?" : "";
  console.log(
    String(i).padStart(3) +
      " | " +
      (style || "-").padEnd(12) +
      " | " +
      (jc || "-").padEnd(6) +
      " | sz=" + (size || "-") +
      " | " + fonts.padEnd(24) +
      " | " + bold + img + pgbrk + tbl +
      " | " + (ind ? ind.slice(0, 40) : "") +
      " | " + (spacing ? spacing.slice(0, 46) : "") +
      " | " + text.slice(0, 70)
  );
}
