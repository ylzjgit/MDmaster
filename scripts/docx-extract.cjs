const fs = require("node:fs");
const xml = fs.readFileSync(".docx-tpl/manual/word/document.xml", "utf8");
const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];

// 图片段落原样导出，作为生成新文档的模板
const imgPara = paras[41];
fs.writeFileSync(".docx-tpl/drawing-sample.xml", imgPara, "utf8");
console.log("drawing paras bytes:", imgPara.length);

const body = paras[22];
fs.writeFileSync(".docx-tpl/body-sample.xml", body, "utf8");
console.log("body para:", body.replace(/></g, "><").slice(0, 600));

console.log("=== drawing head ===");
const d = imgPara.indexOf("<w:drawing");
console.log(imgPara.slice(d, d + 1400).replace(/></g, ">\n<"));

console.log("=== rels ===");
console.log(fs.readFileSync(".docx-tpl/manual/word/_rels/document.xml.rels", "utf8").replace(/></g, ">\n<"));
