const fs = require("node:fs");
const file = process.argv[2];
const ids = process.argv.slice(3);
const xml = fs.readFileSync(file, "utf8");
for (const id of ids) {
  const re = new RegExp('<w:style [^>]*w:styleId="' + id + '"[\\s\\S]*?</w:style>');
  const m = re.exec(xml);
  console.log("===== style " + id + " =====");
  console.log(m ? m[0].replace(/></g, ">\n<") : "NOT FOUND");
}
