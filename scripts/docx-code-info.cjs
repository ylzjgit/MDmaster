const fs = require("node:fs");
const x = fs.readFileSync(".docx-tpl/code/word/document.xml", "utf8");
const paras = x.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
console.log("paragraphs:", paras.length);
console.log("pagebreaks:", (x.match(/<w:br w:type="page"\/>/g) || []).length);
console.log("tables:", (x.match(/<w:tbl>/g) || []).length);
const sect = /<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(x);
console.log("sectPr:", sect ? sect[0].replace(/></g, ">\n<") : "none");
for (let i = 0; i < 3; i += 1) {
  console.log("--- para " + (i + 1) + " ---");
  console.log(paras[i].replace(/></g, ">\n<").slice(0, 900));
}
// 检查每页行数：找出所有分页符所在的段落序号
let pageStart = 0;
const sizes = [];
for (let i = 0; i < paras.length; i += 1) {
  if (/<w:br w:type="page"\/>/.test(paras[i])) {
    sizes.push(i + 1 - pageStart);
    pageStart = i + 1;
  }
}
sizes.push(paras.length - pageStart);
console.log("lines per page:", sizes.join(","));
