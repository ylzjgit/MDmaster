"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { zip } = require("./lib-zip.cjs");

const TPL = ".docx-tpl";
const OUT = "E:\\北京云林智炬信息科技有限公司\\软著";
const SHOTS = path.join(TPL, "shots");

const NAME = "云林智炬MDMaster Markdown编写和阅读软件";
const COMPANY = "北京云林智炬信息科技有限公司";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BODY_SPACING = 'w:before="80" w:after="80" w:line="360" w:lineRule="auto"';
const LIST_SPACING = 'w:before="40" w:after="40" w:line="360" w:lineRule="auto"';

function run(text, opts) {
  const o = opts || {};
  const font = o.font || "宋体";
  const rpr = ['<w:rFonts w:ascii="' + font + '" w:eastAsia="' + font + '" w:hAnsi="' + font + '"/>'];
  if (o.bold) rpr.push("<w:b/><w:bCs/>");
  if (o.color) rpr.push('<w:color w:val="' + o.color + '"/>');
  if (o.size) rpr.push('<w:sz w:val="' + o.size + '"/><w:szCs w:val="' + o.size + '"/>');
  return '<w:r><w:rPr>' + rpr.join("") + '</w:rPr><w:t xml:space="preserve">' + esc(text) + "</w:t></w:r>";
}

function para(opts) {
  const o = opts || {};
  const ppr = [];
  if (o.style) ppr.push('<w:pStyle w:val="' + o.style + '"/>');
  if (o.pageBreakBefore) ppr.push("<w:pageBreakBefore/>");
  const spacing = o.spacing === undefined ? BODY_SPACING : o.spacing;
  if (spacing && spacing !== "none") ppr.push("<w:spacing " + spacing + "/>");
  if (o.ind) ppr.push("<w:ind " + o.ind + "/>");
  if (o.jc) ppr.push('<w:jc w:val="' + o.jc + '"/>');
  const runs = [];
  if (o.text !== undefined) runs.push(run(o.text, o));
  if (o.runs) runs.push(...o.runs);
  if (o.pageBreak) runs.push('<w:r><w:br w:type="page"/></w:r>');
  return "<w:p>" + (ppr.length ? "<w:pPr>" + ppr.join("") + "</w:pPr>" : "") + runs.join("") + "</w:p>";
}

function imageP(rid, cx, cy, id) {
  const drawing =
    '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    '<wp:docPr id="' + id + '" name="图片 ' + id + '"/>' +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="图片 ' + id + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
    "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>";
  return (
    "<w:p><w:pPr>" +
    '<w:spacing w:before="120" w:after="0" w:line="240" w:lineRule="auto"/>' +
    '<w:jc w:val="center"/>' +
    "</w:pPr><w:r><w:rPr><w:noProof/></w:rPr>" +
    drawing +
    "</w:r></w:p>"
  );
}

function tocField() {
  return (
    "<w:p><w:pPr><w:pStyle w:val=\"TOC\"/></w:pPr>" +
    run("目录", { bold: true, size: 28 }) +
    "</w:p>" +
    '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>' +
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    run("目录将在打开文档后自动更新", { size: 21, color: "808080" }) +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
    "</w:p>"
  );
}

const FIGURES = [
  { file: "01-overview.png", caption: "图 1 MDMaster 主界面" },
  { file: "02-files.png", caption: "图 2 文件管理与右键菜单" },
  { file: "03-editor.png", caption: "图 3 Markdown 编辑区与代码块高亮" },
  { file: "08-shortcuts.png", caption: "图 4 快捷键面板" },
  { file: "04-preview.png", caption: "图 5 实时预览与目录联动" },
  { file: "05-images.png", caption: "图 6 图片与图注渲染" },
  { file: "06-copy.png", caption: "图 7 一键复制到公众号" },
  { file: "07-settings.png", caption: "图 8 设置面板" },
];

const CX = 5278120;

function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/* 内容表：h1 一级标题 / h2 二级标题 / p 正文 / b 加粗引导 / li 项目 / no 步骤 / fig 图片 */
const CONTENT = [
  ["h1", "1 概述"],
  ["p", NAME + "是一款面向企业文案、技术文档与自媒体内容创作人员设计的 Markdown 编写与阅读工具。软件采用左右分栏布局，左侧为 Markdown 源码编辑区，右侧为实时渲染预览区，两侧滚动位置双向联动，实现“所写即所见”的高效写作体验。"],
  ["p", "软件提供完整的文件与工程管理能力，可以将本地任意文件夹打开为写作工程，对工程内的多个 Markdown 文档与子文件夹进行新建、重命名、删除、拖拽移动与快速检索；编辑区提供常用 Markdown 语法的快捷键录入、语法高亮、多标签编辑与自动保存。"],
  ["p", "软件内置公众号排版引擎，渲染时将标题、段落、列表、引用、表格、代码高亮等全部样式转换为行内样式，支持一键将渲染结果复制为富文本并直接粘贴到微信公众号编辑器；同时提供本地图片粘贴落盘、图片图注渲染、公众号素材接口自动上传图片、多套排版主题切换与独立 HTML 导出能力。"],
  ["p", "软件基于 Electron 桌面框架开发，界面层采用 React 与 TypeScript 构建，Markdown 解析采用 markdown-it 引擎，代码高亮采用 highlight.js，编辑器内核采用 CodeMirror 6，在 Windows 平台以安装包形式独立部署运行。"],

  ["h1", "2 系统概述"],
  ["p", NAME + "主要包括文件与工程管理、Markdown 编辑、实时预览与目录联动、图片与本地图床、公众号排版与一键复制、主题与导出设置等六大功能模块，覆盖从素材整理、正文写作到公众号发布的完整链路。"],
  ["li", "文件与工程管理模块：工程目录选择、文件树展示、新建、重命名、删除、拖拽移动、搜索过滤、多标签编辑"],
  ["li", "Markdown 编辑模块：语法高亮、行号显示、自动换行、二十余项语法快捷键、查找替换、自动保存"],
  ["li", "实时预览与目录联动模块：分屏预览、双向滚动联动、标题自动生成目录、点击定位"],
  ["li", "图片与本地图床模块：截图粘贴自动落盘、相对路径引用、图注渲染、图片上传"],
  ["li", "公众号排版与一键复制模块：行内样式渲染、代码高亮内联、富文本剪贴板写入、本地图片自动上传"],
  ["li", "主题与导出设置模块：四套公众号主题、软换行开关、独立 HTML 导出、上传凭据配置"],

  ["h1", "3 运行环境"],
  ["h2", "3.1 硬件环境"],
  ["li", "CPU：64 位双核处理器（例如 Intel Core i3 或同级 AMD 处理器）"],
  ["li", "内存：4GB（基础运行），推荐 8GB"],
  ["li", "硬盘：256GB HDD（有 500MB 以上可用空间）或 SSD"],
  ["li", "显示器：分辨率 1366×768 及以上"],
  ["h2", "3.2 软件环境"],
  ["li", "操作系统：Windows 10 / Windows 11（64 位）"],
  ["li", "运行库：无需额外安装运行库，安装包已内置 Electron 运行时"],
  ["li", "浏览器内核：软件内置 Chromium 内核，无需依赖系统浏览器"],
  ["li", "可选配置：微信公众号 AppID / AppSecret（用于复制到公众号时自动上传图片）"],

  ["h1", "4 功能界面"],
  ["p", NAME + "主界面如图 1 所示，由顶栏、文件管理栏、标签栏、格式工具栏、Markdown 编辑区、实时预览区、目录栏和状态栏组成。"],
  ["fig", 0],

  ["h2", "4.1 文件与工程管理模块"],
  ["p", "功能描述：该模块用于管理本地写作工程。点击顶栏或文件栏中的“打开文件夹”按钮选择任意本地文件夹作为工程目录，软件会递归扫描该目录下的 Markdown 文档与子文件夹，并在左侧文件栏中以树形结构展示。"],
  ["b", "界面组成："],
  ["li", "文件栏：树形展示工程目录下的文档与文件夹，文件夹可展开与折叠"],
  ["li", "工程操作按钮：打开文件夹、新建文档、新建文件夹、刷新文件列表、收起文件栏"],
  ["li", "搜索框：按文件名关键字实时过滤文件树"],
  ["li", "标签栏：以标签形式展示当前打开的全部文档，标签带未保存状态标记"],
  ["b", "操作步骤："],
  ["no", "点击“打开文件夹”按钮，在弹出的目录选择窗口中选择目标文件夹"],
  ["no", "在文件树中单击文档即可在右侧打开，支持同时打开多个文档"],
  ["no", "右键单击文件或文件夹，可进行新建、重命名、复制路径、在文件夹中显示、删除（移入回收站）等操作"],
  ["no", "直接拖动文件到目标文件夹即可完成移动"],
  ["fig", 1],

  ["h2", "4.2 Markdown 编辑与快捷键模块"],
  ["p", "功能描述：该模块基于 CodeMirror 6 编辑器内核实现 Markdown 源码编辑，提供语法高亮、行号显示、自动换行、查找替换与多光标编辑等能力，并对标题、加粗、斜体、代码块、表格等常用语法提供快捷键支持。"],
  ["b", "主要功能："],
  ["li", "语法高亮：标题、加粗、斜体、行内代码、代码块、链接、列表等元素分色显示"],
  ["li", "快捷键录入：Ctrl+B 加粗、Ctrl+1~6 标题、Ctrl+Shift+K 代码块、Ctrl+Shift+M 表格等"],
  ["li", "自动保存：停止输入约 0.7 秒后自动写回磁盘，关闭窗口前等待最后一次保存完成"],
  ["li", "状态统计：状态栏实时显示字数、字符数、预计阅读时间与光标行列位置"],
  ["fig", 2],
  ["p", "按 Ctrl+/ 可打开快捷键面板，查看全部 Markdown 语法与应用操作快捷键，如图 4 所示。"],
  ["fig", 3],

  ["h2", "4.3 实时预览与目录联动模块"],
  ["p", "功能描述：编辑区右侧为实时渲染预览区，输入内容后立即渲染。预览区与编辑区滚动位置双向联动：滚动编辑区时预览区自动定位到对应位置，滚动预览区时编辑区同步滚动。"],
  ["b", "技术特点："],
  ["li", "双向滚动联动：以 Markdown 源码行号为锚点建立映射，滚动时按行号与块内比例精确对齐"],
  ["li", "智能目录：自动提取全部标题生成右侧目录，滚动时高亮当前章节，单击目录项跳转到对应位置"],
  ["li", "视图切换：支持纯编辑、分屏、纯预览三种视图模式，分屏比例可拖拽调整"],
  ["li", "段落定位：单击预览区任意段落，编辑区光标自动定位到对应的源码行"],
  ["fig", 4],

  ["h2", "4.4 图片与本地图床模块"],
  ["p", "功能描述：该模块支持在编辑区内直接粘贴截图或拖入图片文件，软件自动将图片保存到工程目录下的图片文件夹（默认 assets），并在文档中插入相对路径的 Markdown 图片语法，实现图片的本地化管理。"],
  ["b", "主要功能："],
  ["li", "截图粘贴：在编辑区按 Ctrl+V 粘贴截图，图片自动落盘并插入引用"],
  ["li", "图注渲染：单独成段的图片渲染为“图片 + 图注”，图注优先取图片 title，其次取图片描述"],
  ["li", "相对路径解析：图片路径相对当前文档解析，子目录文档自动使用 ../assets 形式引用"],
  ["li", "加载保护：预览时图片加载失败会显示占位提示，便于发现失效引用"],
  ["fig", 5],

  ["h2", "4.5 公众号排版与一键复制模块"],
  ["p", "功能描述：该模块是软件的核心输出组件。渲染 Markdown 时，软件将标题、段落、列表、引用、表格、代码高亮等全部样式转换为行内样式，确保粘贴到微信公众号编辑器后样式不丢失。"],
  ["b", "技术特点："],
  ["li", "内联样式渲染：所有元素均带 style 属性，不依赖外部样式表"],
  ["li", "代码高亮内联：highlight.js 生成的高亮标记转换为 span 行内颜色"],
  ["li", "富文本剪贴板：通过系统剪贴板写入 text/html，可直接粘贴为公众号图文"],
  ["li", "图片自动上传：复制时自动将本地图片上传为公网地址，支持公众号素材接口与自定义图床"],
  ["b", "操作步骤："],
  ["no", "在工具栏选择公众号主题配色"],
  ["no", "点击右上角“复制到公众号”按钮，复制成功后界面给出提示"],
  ["no", "打开微信公众号后台编辑器，在正文区域按 Ctrl+V 粘贴"],
  ["fig", 6],

  ["h2", "4.6 主题设置与导出模块"],
  ["p", "功能描述：该模块提供排版主题切换、软换行开关、图片目录设置、公众号上传凭据配置与独立 HTML 导出等功能。"],
  ["b", "主要功能："],
  ["li", "排版主题：内置简约黑白、微信绿、科技蓝、暖阳橙四套公众号主题"],
  ["li", "软换行开关：控制单个换行是否渲染为换行，适配公众号排版习惯"],
  ["li", "图片与上传设置：设置图片保存目录、公众号 AppID/AppSecret 或自定义图床接口"],
  ["li", "导出 HTML：将渲染结果导出为可独立分发的 HTML 文件"],
  ["fig", 7],

  ["h1", "5 注意事项"],
  ["p", "1. 首次使用请在顶栏点击“打开文件夹”，选择一个本地文件夹作为写作工程目录。"],
  ["p", "2. 粘贴或拖入的图片默认保存在工程目录下的 assets 文件夹，请勿手动删除该文件夹，否则文档中的图片引用将失效。"],
  ["p", "3. 复制到公众号时如需自动上传图片，需在设置中填写公众号 AppID 与 AppSecret，并将本机公网 IP 加入公众号后台的 IP 白名单。"],
  ["p", "4. 公众号官方图片上传接口单张图片限制为 1MB，格式支持 JPG 与 PNG，超出限制的图片请压缩后再使用。"],
  ["p", "5. 微信正文不支持外部链接跳转，粘贴后链接文字会保留但无法单击访问，属平台限制。"],
  ["p", "6. 软件采用自动保存机制，编辑内容会定时写回磁盘；如需留存历史版本，建议配合版本管理或定期备份工程目录。"],
  ["p", "7. 本软件渲染与排版结果供内容创作使用，具体发布规范请遵循微信公众号平台的相关规定。"],
];

function manualBody() {
  const out = [];
  out.push(para({ jc: "center", text: "云林智炬MDMaster Markdown", bold: true, size: 44, spacing: 'w:before="1400" w:after="0"' }));
  out.push(para({ jc: "center", text: "编写和阅读软件 V1.0", bold: true, size: 44, spacing: 'w:before="0" w:after="400"' }));
  out.push(para({ jc: "center", text: "使 用 说 明 书", bold: true, size: 48, spacing: 'w:before="0" w:after="6000"' }));
  out.push(para({ jc: "center", text: COMPANY, size: 28, spacing: 'w:before="0" w:after="120"' }));
  out.push(para({ jc: "center", text: "2026 年 11 月", size: 28, spacing: "none", pageBreak: true }));
  out.push(tocField());
  out.push(para({ pageBreak: true, spacing: "none" }));

  for (const item of CONTENT) {
    const kind = item[0];
    if (kind === "h1") out.push(para({ style: "1", text: item[1], spacing: "none", pageBreakBefore: item[1].indexOf("4 功能界面") === 0 || item[1].indexOf("5 注意事项") === 0 }));
    else if (kind === "h2") out.push(para({ style: "21", text: item[1], spacing: "none" }));
    else if (kind === "p") out.push(para({ text: item[1], ind: 'w:firstLine="420"' }));
    else if (kind === "b") out.push(para({ text: item[1], bold: true, ind: 'w:firstLine="420"' }));
    else if (kind === "li") out.push(para({ style: "a0", text: item[1], spacing: LIST_SPACING }));
    else if (kind === "no") out.push(para({ style: "a", text: item[1], spacing: LIST_SPACING, ind: 'w:left="360"' }));
    else if (kind === "fig") {
      const index = item[1];
      const figure = FIGURES[index];
      const buffer = fs.readFileSync(path.join(SHOTS, figure.file));
      const size = pngSize(buffer);
      const cy = Math.round((CX * size.height) / size.width);
      out.push(imageP("rId" + (200 + index), CX, cy, 1000 + index));
      out.push(para({ style: "af7", text: figure.caption, jc: "center", spacing: 'w:before="60" w:after="240" w:line="240" w:lineRule="auto"', size: 18 }));
    }
  }
  return out.join("");
}

const CODE_ORDER = [
  "electron/main.cjs",
  "electron/preload.cjs",
  "index.html",
  "vite.config.ts",
  "src/main.tsx",
  "src/types.ts",
  "src/lib/theme.ts",
  "src/lib/markdown.ts",
  "src/lib/transforms.ts",
  "src/lib/commands.ts",
  "src/lib/scrollSync.ts",
  "src/lib/tree.ts",
  "src/lib/clipboard.ts",
  "src/lib/storage.ts",
  "src/lib/bridge.ts",
  "src/lib/shortcuts.ts",
  "src/styles/app.css",
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
];

function sourceLines() {
  const lines = [];
  for (const file of CODE_ORDER) {
    const isHtml = file.endsWith(".html");
    if (lines.length > 0) lines.push("");
    lines.push(
      isHtml
        ? "<!-- ============ " + file + " ============ -->"
        : "/* ============ " + file + " ============ */"
    );
    const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\t/g, "    ");
    for (const line of text.split("\n")) lines.push(line.replace(/\s+$/, ""));
  }
  return lines;
}

const HEAD_LINES = 1500;
const TAIL_LINES = 1500;

function codeParagraphs() {
  const all = sourceLines();
  const selected = all.length <= HEAD_LINES + TAIL_LINES ? all : all.slice(0, HEAD_LINES).concat(all.slice(all.length - TAIL_LINES));
  const out = [];
  const font = "Courier New";
  for (const line of selected) {
    out.push(
      "<w:p><w:pPr>" +
        '<w:spacing w:before="0" w:after="0" w:line="279" w:lineRule="exact"/>' +
        '<w:rPr><w:rFonts w:ascii="' + font + '" w:eastAsia="宋体" w:hAnsi="' + font + '"/><w:sz w:val="18"/></w:rPr>' +
        "</w:pPr>" +
        (line.length === 0
          ? ""
          : '<w:r><w:rPr><w:rFonts w:ascii="' + font + '" w:eastAsia="宋体" w:hAnsi="' + font + '"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">' +
            esc(line) +
            "</w:t></w:r>") +
        "</w:p>"
    );
  }
  console.log("code lines included:", selected.length, "of", all.length);
  return out.join("");
}

function listFiles(dir, base) {
  const root = base || dir;
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, root));
    else out.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return out;
}

function buildDocx(kind, bodyXml, replacements, dropFiles) {
  const dir = path.join(TPL, kind);
  const tplDoc = fs.readFileSync(path.join(dir, "word/document.xml"), "utf8");
  const bodyStart = tplDoc.indexOf("<w:body>");
  const rootOpen = tplDoc.slice(0, bodyStart);
  const sectPr = /<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(tplDoc)[0];
  const documentXml = rootOpen + "<w:body>" + bodyXml + sectPr + "</w:body></w:document>";

  const entries = [{ name: "word/document.xml", data: Buffer.from(documentXml, "utf8") }];
  const skip = new Set(["word/document.xml"].concat(dropFiles || []));
  const included = new Set();
  for (const rel of listFiles(dir)) {
    if (skip.has(rel)) continue;
    const data = replacements[rel] || fs.readFileSync(path.join(dir, rel));
    entries.push({ name: rel, data });
    included.add(rel);
  }
  // 模板里不存在、需要新增的部件（例如说明书截图）
  for (const rel of Object.keys(replacements)) {
    if (included.has(rel) || skip.has(rel)) continue;
    entries.push({ name: rel, data: replacements[rel] });
    included.add(rel);
  }
  const ct = entries.splice(entries.findIndex((e) => e.name === "[Content_Types].xml"), 1)[0];
  entries.unshift(ct);
  return zip(entries);
}

function writeDocx(fileName, buffer) {
  const target = path.join(OUT, fileName);
  fs.writeFileSync(target, buffer);
  console.log("written:", target, (buffer.length / 1024).toFixed(0) + "KB");
}

function buildManual() {
  const relsTpl = fs.readFileSync(path.join(TPL, "manual", "word/_rels/document.xml.rels"), "utf8");
  const imageRels = FIGURES.map(
    (item, index) =>
      '<Relationship Id="rId' +
      (200 + index) +
      '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' +
      item.file +
      '"/>'
  ).join("");
  const rels = relsTpl.replace(/<Relationship Id="rId8"[^>]*\/>/, "").replace("</Relationships>", imageRels + "</Relationships>");

  const header = fs
    .readFileSync(path.join(TPL, "manual", "word/header1.xml"), "utf8")
    .replace("云林智炬发票明细生成软件 V1.0--使用说明书", esc(NAME) + " V1.0——使用说明书");

  const core = fs
    .readFileSync(path.join(TPL, "manual", "docProps/core.xml"), "utf8")
    .replace(/<dc:title>[^<]*<\/dc:title>/, "<dc:title>" + esc(NAME) + " V1.0——使用说明书</dc:title>")
    .replace(/<dc:creator>[^<]*<\/dc:creator>/, "<dc:creator>" + COMPANY + "</dc:creator>")
    .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, "<cp:lastModifiedBy>" + COMPANY + "</cp:lastModifiedBy>");

  const dotRels = fs
    .readFileSync(path.join(TPL, "manual", "_rels/.rels"), "utf8")
    .replace(/<Relationship [^>]*thumbnail[^>]*\/>/, "");

  const replacements = {
    "word/_rels/document.xml.rels": Buffer.from(rels, "utf8"),
    "word/header1.xml": Buffer.from(header, "utf8"),
    "docProps/core.xml": Buffer.from(core, "utf8"),
    "_rels/.rels": Buffer.from(dotRels, "utf8"),
  };
  FIGURES.forEach((figure, index) => {
    replacements["word/media/" + figure.file] = fs.readFileSync(path.join(SHOTS, figure.file));
  });

  writeDocx(
    "云林智炬MDMaster Markdown编写和阅读软件V1.0——说明书.docx",
    buildDocx("manual", manualBody(), replacements, ["word/media/image1.png", "docProps/thumbnail.emf"])
  );
}

function buildCode() {
  const header = fs
    .readFileSync(path.join(TPL, "code", "word/header1.xml"), "utf8")
    .replace("云林智炬发票明细生成软件 V1.0--源代码", esc(NAME) + "——源代码");

  const core = fs
    .readFileSync(path.join(TPL, "code", "docProps/core.xml"), "utf8")
    .replace(/<dc:title>[^<]*<\/dc:title>/, "<dc:title>" + esc(NAME) + "——源代码</dc:title>")
    .replace(/<dc:creator>[^<]*<\/dc:creator>/, "<dc:creator>" + COMPANY + "</dc:creator>")
    .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, "<cp:lastModifiedBy>" + COMPANY + "</cp:lastModifiedBy>");

  const dotRels = fs
    .readFileSync(path.join(TPL, "code", "_rels/.rels"), "utf8")
    .replace(/<Relationship [^>]*thumbnail[^>]*\/>/, "");

  writeDocx(
    "云林智炬MDMaster Markdown编写和阅读软件——源代码.docx",
    buildDocx(
      "code",
      codeParagraphs(),
      {
        "word/header1.xml": Buffer.from(header, "utf8"),
        "docProps/core.xml": Buffer.from(core, "utf8"),
        "_rels/.rels": Buffer.from(dotRels, "utf8"),
      },
      ["docProps/thumbnail.emf"]
    )
  );
}

buildManual();
buildCode();
