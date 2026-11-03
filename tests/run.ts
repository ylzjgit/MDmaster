import assert from "node:assert/strict";
import {
  renderMarkdown,
  computeStats,
  escapeHtml,
  buildStandaloneHtml,
  toCopyHtml,
  collectLocalImageSrcs,
  buildLocalImageUrl,
} from "../src/lib/markdown";
import { getTheme } from "../src/lib/theme";
import * as T from "../src/lib/transforms";

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(name + " -> " + (error as Error).message);
  }
}

const theme = getTheme("wechat-green");
const md = [
  "# 主标题",
  "",
  "普通段落，包含 **加粗**、*斜体*、`内联代码` 与 [链接](https://example.com)。",
  "",
  "## 二级标题",
  "",
  "> 一段引用",
  "",
  "- 项目一",
  "- [x] 已完成任务",
  "- [ ] 未完成任务",
  "",
  "1. 第一",
  "2. 第二",
  "",
  "| 名称 | 值 |",
  "| --- | :-: |",
  "| a | 1 |",
  "",
  "```js",
  "const x = 1; // 注释",
  "function hello() { return x; }",
  "```",
  "",
  "![本地图片](images/demo.png)",
  "",
  "---",
].join("\n");

const result = renderMarkdown(md, { theme, docPath: "E:/docs/note.md" });

test("渲染出 h1/h2 且带内联样式", () => {
  assert.match(result.html, /<h1[^>]*style="[^"]*font-size:25px/);
  assert.match(result.html, /<h2[^>]*style="[^"]*border-left:4px solid #07c160/);
});

test("标题带 id / data-line / data-heading", () => {
  assert.match(result.html, /<h1[^>]*id="主标题"/);
  assert.match(result.html, /<h1[^>]*data-line="0"/);
  assert.match(result.html, /data-heading="/);
});

test("目录包含两个标题且层级正确", () => {
  assert.equal(result.toc.length, 2);
  assert.equal(result.toc[0].level, 1);
  assert.equal(result.toc[1].level, 2);
  assert.equal(result.toc[1].text, "二级标题");
  assert.equal(result.toc[1].line, 4);
});

test("加粗 / 斜体 / 内联代码有内联样式", () => {
  assert.match(result.html, /<strong style="font-weight:700[^"]*">加粗<\/strong>/);
  assert.match(result.html, /<em style="[^"]*font-style:italic/);
  assert.match(result.html, /<code style="[^"]*font-family:ui-monospace/);
});

test("代码高亮 class 被换成内联样式且无残留 class", () => {
  assert.ok(!/class="hljs/.test(result.html), "仍有 hljs class 残留");
  assert.ok(!/\sclass=/.test(result.html), "仍残留 class 属性");
  assert.ok(!/\sclass=/.test(result.copyHtml), "复制版残留 class 属性");
  assert.match(result.html, /<span style="color:#d73a49">const<\/span>/);
  assert.match(result.html, /<pre[^>]*style="[^"]*background:#f7f8fa/);
});

test("表格单元格样式与对齐样式合并", () => {
  assert.match(result.html, /<th[^>]*style="[^"]*border:1px solid #e6e8ec/);
  assert.match(result.html, /<td[^>]*style="[^"]*text-align:center/);
});

test("任务列表转成方框字符", () => {
  assert.match(result.html, /&#9745;/);
  assert.match(result.html, /&#9744;/);
  assert.ok(!/\[x\]/.test(result.html), "任务标记未替换");
});

test("本地图片在预览中解析为 mdlocal:// 绝对地址，并记录原地址", () => {
  assert.match(result.html, /src="mdlocal:\/\/\/E:\/docs\/images\/demo.png"/);
  assert.match(result.html, /data-orig="images\/demo.png"/);
});

test("中文目录与文件名只做一次百分号编码", () => {
  const cn = renderMarkdown("![图](assets/示意图.svg)", { theme, docPath: "E:/我的文档/笔记.md" });
  assert.ok(cn.html.indexOf("%25") === -1, "出现二次编码");
  assert.match(cn.html, /src="mdlocal:\/\/\/E:\/%E6%88%91%E7%9A%84%E6%96%87%E6%A1%A3\/assets\/%E7%A4%BA%E6%84%8F%E5%9B%BE\.svg"/);
});

test("复制版 HTML 去掉联动属性并还原图片地址", () => {
  assert.ok(!/data-line=/.test(result.copyHtml), "data-line 未清除");
  assert.ok(!/data-heading=/.test(result.copyHtml), "data-heading 未清除");
  assert.ok(!/data-orig=/.test(result.copyHtml), "data-orig 未清除");
  assert.match(result.copyHtml, /src="images\/demo.png"/);
  assert.match(result.copyHtml, /^<section style="/);
});

test("复制版 HTML 支持把本地图片换成公网地址", () => {
  const local = renderMarkdown("![图](assets/a.png)", { theme, docPath: "E:/docs/n.md" });
  const srcs = collectLocalImageSrcs(local.html);
  assert.equal(srcs.length, 1);
  assert.ok(srcs[0].indexOf("mdlocal:") === 0);
  const html = toCopyHtml(local.html, { [srcs[0]]: "https://mmbiz.qpic.cn/x.png" });
  assert.match(html, /src="https:\/\/mmbiz\.qpic\.cn\/x\.png"/);
  assert.ok(html.indexOf("mdlocal:") === -1, "公网地址替换后仍残留本地地址");
  assert.ok(html.indexOf("data-orig") === -1, "data-orig 未清除");
});

test("上传失败时图片回退到 Markdown 原始路径", () => {
  const local = renderMarkdown("![图](assets/a.png)", { theme, docPath: "E:/docs/n.md" });
  const html = toCopyHtml(local.html);
  assert.match(html, /src="assets\/a.png"/);
  assert.ok(html.indexOf("mdlocal:") === -1);
});

test("独立成段的图片渲染为图片 + 图注", () => {
  const r = renderMarkdown("![示意图](assets/a.svg)", { theme, docPath: "E:/docs/n.md" });
  assert.match(r.html, /<section[^>]*text-align:center/);
  assert.match(r.html, /<span[^>]*display:block[^>]*>示意图<\/span>/);
  assert.ok(!/\<p[^>]*><img/.test(r.html), "块级图片不应包在 <p> 里");
});

test("图片 title 优先作为图注", () => {
  const r = renderMarkdown('![替代文字](assets/a.svg "这是标题")', { theme, docPath: "E:/docs/n.md" });
  assert.match(r.html, />这是标题<\/span>/);
  assert.ok(r.html.indexOf(">替代文字</span>") === -1, "title 存在时不应使用 alt 作图注");
});

test("行内图片不生成图注", () => {
  const r = renderMarkdown("文字 ![图注](assets/a.svg) 文字", { theme, docPath: "E:/docs/n.md" });
  assert.ok(r.html.indexOf("图注</span>") === -1, "行内图片不该有图注");
  assert.match(r.html, /<p[^>]*>[^<]*<img/);
});

test("图注在复制版 HTML 中保留为内联样式", () => {
  const r = renderMarkdown("![示意图](assets/a.svg)", { theme, docPath: "E:/docs/n.md" });
  const copy = toCopyHtml(r.html);
  assert.match(copy, /<span style="[^"]*display:block/);
  assert.match(copy, />示意图<\/span>/);
  assert.ok(copy.indexOf("data-line") === -1);
});

test("引用内段落收紧上下间距", () => {
  const r = renderMarkdown("> 引用内容", { theme });
  assert.match(r.html, /<p style="[^"]*margin:10px 0/);
});

test("列表内段落收紧上下间距", () => {
  const loose = renderMarkdown("- 第一段\n\n- 第二段", { theme });
  assert.match(loose.html, /<p style="[^"]*margin:6px 0/);
});

test("网络图片走主进程缓存，复制时还原原始公网地址", () => {
  const html = renderMarkdown("![图](https://files.mdnice.com/user/1176/a.png)", {
    theme,
    docPath: "E:/d/n.md",
  });
  assert.match(html.html, /src="mdlocal:\/\/remote\/\?u=https%3A%2F%2Ffiles\.mdnice\.com%2Fuser%2F1176%2Fa\.png"/);
  assert.equal(collectLocalImageSrcs(html.html).length, 0, "远程图不应进入上传队列");
  assert.match(toCopyHtml(html.html), /src="https:\/\/files\.mdnice\.com\/user\/1176\/a\.png"/);
});

test("Windows 绝对路径与 file:// 按绝对路径解析", () => {
  const abs = renderMarkdown("![a](E:/images/x.png)", { theme, docPath: "E:/d/n.md" });
  assert.match(abs.html, /src="mdlocal:\/\/\/E:\/images\/x\.png"/);
  const fileUrl = renderMarkdown("![a](file:///E:/images/y.png)", { theme, docPath: "E:/d/n.md" });
  assert.match(fileUrl.html, /src="mdlocal:\/\/\/E:\/images\/y\.png"/);
});

test("buildLocalImageUrl 处理反斜杠、空格与中文", () => {
  assert.equal(buildLocalImageUrl("E:\\图片\\x y.png"), "mdlocal:///E:/%E5%9B%BE%E7%89%87/x%20y.png");
  assert.equal(buildLocalImageUrl("E:/%E5%9B%BE/x.png"), "mdlocal:///E:/%E5%9B%BE/x.png", "已编码路径不应二次编码");
});

test("统计字数", () => {
  const stats = computeStats("# 标题\n\n这是一段中文，共十个字左右。\n\nHello world 2024");
  assert.ok(stats.words > 10, "词数过少: " + stats.words);
  assert.ok(stats.chars > 10);
  assert.ok(stats.minutes >= 1);
});

test("escapeHtml", () => {
  assert.equal(escapeHtml('<a href="x">&</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});

test("独立 HTML 包含标题与容器", () => {
  const doc = buildStandaloneHtml("我的文章", result.copyHtml);
  assert.match(doc, /<title>我的文章<\/title>/);
  assert.match(doc, /<!doctype html>/);
});

test("breaks 选项生效", () => {
  const soft = renderMarkdown("第一行\n第二行", { theme, breaks: true });
  assert.match(soft.html, /<br>/);
  const hard = renderMarkdown("第一行\n第二行", { theme, breaks: false });
  assert.ok(!/<br>/.test(hard.html));
});

test("重复标题生成唯一 id", () => {
  const dup = renderMarkdown("# 同名\n\n# 同名", { theme });
  assert.match(dup.html, /id="同名"/);
  assert.match(dup.html, /id="同名-1"/);
});

/* ------------------------------- transforms ------------------------------ */

test("加粗：空选区插入占位并选中", () => {
  const e = T.wrapInline({ text: "abc", start: 3, end: 3 }, "**", "**", "加粗文字");
  assert.equal(e.text, "abc**加粗文字**");
  assert.equal(e.text.slice(e.start, e.end), "加粗文字");
});

test("加粗：有选区包裹", () => {
  const e = T.wrapInline({ text: "hello world", start: 6, end: 11 }, "**", "**", "x");
  assert.equal(e.text, "hello **world**");
  assert.equal(e.text.slice(e.start, e.end), "world");
});

test("加粗：再次执行取消包裹", () => {
  const e = T.wrapInline({ text: "hello **world**", start: 8, end: 13 }, "**", "**", "x");
  assert.equal(e.text, "hello world");
});

test("标题：逐行添加并可取消", () => {
  const e = T.setHeading({ text: "标题行\n第二行", start: 0, end: 8 }, 2);
  assert.equal(e.text, "## 标题行\n## 第二行");
  const back = T.setHeading(e, 0);
  assert.equal(back.text, "标题行\n第二行");
});

test("无序列表：添加与移除", () => {
  const sel = { text: "a\nb", start: 0, end: 3 };
  const on = T.toggleLinePrefix(sel, /^[-*+] /, () => "- ");
  assert.equal(on.text, "- a\n- b");
  const off = T.toggleLinePrefix(on, /^[-*+] /, () => "- ");
  assert.equal(off.text, "a\nb");
});

test("有序列表：自动编号", () => {
  const on = T.toggleLinePrefix({ text: "x\ny", start: 0, end: 3 }, /^\d+\. /, (i) => i + 1 + ". ");
  assert.equal(on.text, "1. x\n2. y");
});

test("代码块：包裹与解包", () => {
  const fence = T.FENCE;
  const e = T.wrapFence({ text: "const a = 1;", start: 0, end: 12 }, "js");
  assert.equal(e.text, fence + "js\nconst a = 1;\n" + fence);
  const back = T.wrapFence({ text: e.text, start: 0, end: e.text.length }, "");
  assert.equal(back.text, "const a = 1;");
});

test("插入块：空文档", () => {
  const e = T.insertBlock({ text: "", start: 0, end: 0 }, "---");
  assert.equal(e.text, "---");
});

test("插入块：段落之间换行且光标在块内", () => {
  const e = T.insertBlock({ text: "aaa", start: 3, end: 3 }, "---");
  assert.equal(e.text, "aaa\n---");
  assert.equal(e.text.slice(e.start, e.end), "---");
});

test("链接：选中文字后光标落到 URL", () => {
  const e = T.insertLink({ text: "点击这里", start: 0, end: 4 }, "链接文字", "https://");
  assert.equal(e.text, "[点击这里](https://)");
  assert.equal(e.text.slice(e.start, e.end), "https://");
});

test("图片：选中 URL 时反转为图片语法", () => {
  const e = T.insertImage({ text: "https://a.com/b.png", start: 0, end: 19 });
  assert.equal(e.text, "![图片描述](https://a.com/b.png)");
  assert.equal(e.text.slice(e.start, e.end), "图片描述");
});

test("表格：生成三列表", () => {
  const e = T.insertTable({ text: "", start: 0, end: 0 }, 1, 3);
  const lines = e.text.split("\n");
  assert.equal(lines[0], "| 列1 | 列2 | 列3 |");
  assert.equal(lines[1], "| --- | --- | --- |");
  assert.equal(lines.length, 3);
});

console.log("passed: " + passed + "/" + (passed + failures.length));
if (failures.length > 0) {
  for (const f of failures) console.log("FAIL " + f);
  process.exit(1);
}
