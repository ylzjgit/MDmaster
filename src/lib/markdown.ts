import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import xml from "highlight.js/lib/languages/xml";
import cssLang from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";
import markdownLang from "highlight.js/lib/languages/markdown";
import diff from "highlight.js/lib/languages/diff";
import plaintext from "highlight.js/lib/languages/plaintext";
import { css, WeChatTheme, Style } from "./theme";

const LANGUAGES: Record<string, unknown> = {
  javascript,
  typescript,
  python,
  java,
  go,
  rust,
  c,
  cpp,
  csharp,
  bash,
  json,
  yaml,
  xml,
  css: cssLang,
  sql,
  markdown: markdownLang,
  diff,
  plaintext,
};

for (const name of Object.keys(LANGUAGES)) {
  hljs.registerLanguage(name, LANGUAGES[name] as never);
}
hljs.registerAliases(["js", "jsx", "node"], { languageName: "javascript" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["sh", "shell", "zsh", "powershell"], { languageName: "bash" });
hljs.registerAliases(["yml"], { languageName: "yaml" });
hljs.registerAliases(["html", "vue", "svg"], { languageName: "xml" });
hljs.registerAliases(["cs"], { languageName: "csharp" });
hljs.registerAliases(["md"], { languageName: "markdown" });

export interface TocItem {
  level: number;
  text: string;
  id: string;
  line: number;
}

export interface DocStats {
  words: number;
  chars: number;
  minutes: number;
}

export interface RenderResult {
  html: string;
  copyHtml: string;
  toc: TocItem[];
  stats: DocStats;
}

export interface RenderOptions {
  theme: WeChatTheme;
  docPath?: string;
  breaks?: boolean;
}

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(input: string): string {
  return String(input).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/`/g, "&#96;");
}

function attrs(list: Array<[string, string | undefined | null]>): string {
  let out = "";
  for (const [name, value] of list) {
    if (value === undefined || value === null) continue;
    out += " " + name + '="' + escapeAttr(String(value)) + '"';
  }
  return out;
}

function inlineStyle(style: Record<string, string>): string {
  return ' style="' + escapeAttr(css(style)) + '"';
}

/** 把 hljs 的 class 全部转成内联样式，微信才能显示颜色 */
function inlineHighlight(html: string, theme: WeChatTheme): string {
  return html.replace(/class="([^"]*)"/g, (_match: string, classList: string) => {
    const merged: Record<string, string> = {};
    for (const part of classList.split(/\s+/).filter(Boolean)) {
      const style = theme.highlight[part];
      if (style) Object.assign(merged, style);
    }
    const declarations = css(merged);
    return declarations === "" ? "" : 'style="' + escapeAttr(declarations) + '"';
  });
}

function plainTextOfInline(token: { children: Array<{ type: string; content: string }> | null; content: string }): string {
  if (!token.children) return token.content;
  let text = "";
  for (const child of token.children) {
    if (child.type === "text" || child.type === "code_inline") text += child.content;
    else if (child.type === "image") text += "";
  }
  return text.trim();
}

function slugify(text: string, fallback: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
  return base || fallback;
}

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

interface RenderEnv {
  toc: TocItem[];
  ids: Map<string, number>;
  theme: WeChatTheme;
  docPath: string;
  quoteDepth?: number;
  listDepth?: number;
}

/** 引用/列表内的段落收紧上下间距，避免整块显得松散 */
function paragraphStyle(env: RenderEnv): Style {
  if ((env.quoteDepth ?? 0) > 0) return Object.assign({}, env.theme.p, { margin: "10px 0" });
  if ((env.listDepth ?? 0) > 0) return Object.assign({}, env.theme.p, { margin: "6px 0" });
  return env.theme.p;
}

function setStyle(token: { attrGet: (name: string) => string | null; attrSet: (name: string, value: string) => void }, style: Record<string, string>): void {
  const existing = token.attrGet("style");
  token.attrSet("style", existing ? existing + ";" + css(style) : css(style));
}

function uniqueId(env: RenderEnv, text: string, index: number): string {
  const base = slugify(text, "heading-" + index);
  const seen = env.ids.get(base) ?? 0;
  env.ids.set(base, seen + 1);
  return seen === 0 ? base : base + "-" + seen;
}

/** 远程图片统一走主进程下载 + 本地缓存（Node fetch 不读系统代理，也不受 Chromium 代理影响） */
// 注意：标准协议下 mdlocal:///remote 会被解析成 host=remote，这里用规范形式
export const REMOTE_IMAGE_PREFIX = "mdlocal://remote/?u=";

export function buildLocalImageUrl(absPath: string): string {
  const normalized = String(absPath).replace(/\\/g, "/");
  const encoded = /%[0-9A-Fa-f]{2}/.test(normalized) ? normalized : encodeURI(normalized);
  return "mdlocal:///" + encoded;
}

export function buildRemoteImageUrl(url: string): string {
  return REMOTE_IMAGE_PREFIX + encodeURIComponent(url);
}

function resolveImageSrc(src: string, env: RenderEnv): string {
  const raw = String(src || "").trim();
  if (!raw) return raw;
  if (/^data:/i.test(raw)) return raw;
  if (/^mdlocal:/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return buildRemoteImageUrl(raw);

  // file:/// 与 Windows 绝对路径：直接按绝对路径处理
  const noScheme = raw.replace(/^file:\/{2,3}/i, "").replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(noScheme) || noScheme.startsWith("//")) {
    return buildLocalImageUrl(noScheme);
  }

  if (!env.docPath) return noScheme;
  // markdown-it 已经对相对路径做过百分号编码，这里只编码文档目录，避免二次编码
  const dir = env.docPath.replace(/\\/g, "/").replace(/\/[^/]*$/, "/");
  const rel = noScheme.replace(/^\.\//, "").replace(/^\/+/, "");
  return "mdlocal:///" + encodeURI(dir) + rel;
}

function createMarkdown(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true,
    typographer: false,
  });

  // markdown-it 默认拦截 file: 协议，放开以便支持 ![](file:///E:/x.png)
  // 仍然拦截可执行脚本协议，避免预览注入
  md.validateLink = (url: string) => {
    const lower = String(url || "").trim().toLowerCase();
    if (lower.startsWith("javascript:")) return false;
    if (lower.startsWith("vbscript:")) return false;
    if (lower.startsWith("file://")) return true;
    if (lower.startsWith("data:")) return true;
    return true;
  };

  // 独立成段的图片：标记为块级图片，渲染成「图片 + 图注」
  md.core.ruler.after("inline", "block_images", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i].type !== "paragraph_open") continue;
      const inline = tokens[i + 1];
      if (!inline || inline.type !== "inline" || !inline.children) continue;
      const meaningful = inline.children.filter((child) => !(child.type === "text" && child.content.trim() === ""));
      if (meaningful.length !== 1 || meaningful[0].type !== "image") continue;
      inline.children = [meaningful[0]];
      meaningful[0].meta = Object.assign({}, meaningful[0].meta, { blockImage: true });
      tokens[i].meta = Object.assign({}, tokens[i].meta, { blockImage: true });
      inline.meta = Object.assign({}, inline.meta, { blockImage: true });
    }
  });

  // 任务列表：把 "[ ] / [x]" 转成带内联样式的方框字符
  md.core.ruler.after("inline", "task_lists", (state) => {
    const tokens = state.tokens;
    const env = state.env as RenderEnv;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i].type !== "list_item_open") continue;
      const inline = tokens[i + 2];
      if (!inline || inline.type !== "inline" || !inline.children || inline.children.length === 0) continue;
      const first = inline.children[0];
      if (first.type !== "text") continue;
      const match = /^\[([ xX])\]\s+/.exec(first.content);
      if (!match) continue;
      const checked = match[1].toLowerCase() === "x";
      const style = checked ? env.theme.taskChecked : env.theme.taskUnchecked;
      const mark = checked ? "&#9745;" : "&#9744;";
      first.content = first.content.slice(match[0].length);
      const span = new state.Token("html_inline", "", 0);
      span.content = "<span" + inlineStyle(style) + ">" + mark + "</span> ";
      inline.children.unshift(span);
    }
  });

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const renderEnv = env as RenderEnv;
    const token = tokens[idx];
    const level = Number(token.tag.slice(1));
    const style = renderEnv.theme[(HEADING_TAGS[level - 1] ?? "h6") as keyof WeChatTheme] as Record<string, string>;
    const inlineToken = tokens[idx + 1];
    const text = inlineToken ? plainTextOfInline(inlineToken as never) : "";
    const line = token.map ? token.map[0] : 0;
    const id = uniqueId(renderEnv, text, renderEnv.toc.length + 1);
    renderEnv.toc.push({ level, text: text || "(未命名标题)", id, line });
    token.attrSet("id", id);
    token.attrSet("data-line", String(line));
    token.attrSet("data-heading", id);
    token.attrSet("style", css(style));
    return self.renderToken(tokens, idx, options);
  };

  const styledToken = (key: string, pick: (env: RenderEnv) => Record<string, string>, withLine: boolean) => {
    const rule = (tokens: never[], idx: number, options: never, env: never, self: { renderToken: (t: never[], i: number, o: never) => string }) => {
      const renderEnv = env as unknown as RenderEnv;
      const token = (tokens as unknown as Array<{ map: [number, number] | null; attrGet: (n: string) => string | null; attrSet: (n: string, v: string) => void }>)[
        idx
      ];
      const style = css(pick(renderEnv));
      const existing = token.attrGet("style");
      token.attrSet("style", existing ? existing + ";" + style : style);
      if (withLine && token.map) token.attrSet("data-line", String(token.map[0]));
      return self.renderToken(tokens, idx, options);
    };
    (md.renderer.rules as Record<string, unknown>)[key] = rule;
  };

  const byTheme = (key: keyof WeChatTheme) => (env: RenderEnv) => env.theme[key] as Record<string, string>;

  md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
    const renderEnv = env as RenderEnv;
    const token = tokens[idx];
    if (token.hidden) return "";
    token.attrSet("style", css(paragraphStyle(renderEnv)));
    if (token.map) token.attrSet("data-line", String(token.map[0]));
    if (token.meta && token.meta.blockImage) {
      return (
        "<section" +
        attrs([
          ["data-line", token.map ? String(token.map[0]) : undefined],
          ["style", css(renderEnv.theme.figure)],
        ]) +
        ">\n"
      );
    }
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.paragraph_close = (tokens, idx, options, _env, self) => {
    const token = tokens[idx];
    if (token.hidden) return "";
    const inline = tokens[idx - 1];
    if (inline && inline.meta && inline.meta.blockImage) return "</section>\n";
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
    const renderEnv = env as RenderEnv;
    renderEnv.quoteDepth = (renderEnv.quoteDepth ?? 0) + 1;
    const token = tokens[idx];
    setStyle(token, renderEnv.theme.blockquote);
    if (token.map) token.attrSet("data-line", String(token.map[0]));
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.blockquote_close = (tokens, idx, options, env, self) => {
    const renderEnv = env as RenderEnv;
    renderEnv.quoteDepth = Math.max(0, (renderEnv.quoteDepth ?? 0) - 1);
    return self.renderToken(tokens, idx, options);
  };

  const listOpen = (key: "ul" | "ol") => (tokens: never[], idx: number, options: never, env: never, self: { renderToken: (t: never[], i: number, o: never) => string }) => {
    const renderEnv = env as unknown as RenderEnv;
    renderEnv.listDepth = (renderEnv.listDepth ?? 0) + 1;
    const token = (tokens as unknown as Array<{ map: [number, number] | null; attrGet: (n: string) => string | null; attrSet: (n: string, v: string) => void }>)[idx];
    setStyle(token, renderEnv.theme[key]);
    if (token.map) token.attrSet("data-line", String(token.map[0]));
    return self.renderToken(tokens, idx, options);
  };

  const listClose = (tokens: never[], idx: number, options: never, env: never, self: { renderToken: (t: never[], i: number, o: never) => string }) => {
    const renderEnv = env as unknown as RenderEnv;
    renderEnv.listDepth = Math.max(0, (renderEnv.listDepth ?? 0) - 1);
    return self.renderToken(tokens, idx, options);
  };

  (md.renderer.rules as Record<string, unknown>).bullet_list_open = listOpen("ul");
  (md.renderer.rules as Record<string, unknown>).ordered_list_open = listOpen("ol");
  (md.renderer.rules as Record<string, unknown>).bullet_list_close = listClose;
  (md.renderer.rules as Record<string, unknown>).ordered_list_close = listClose;

  styledToken("list_item_open", byTheme("li"), true);
  styledToken("table_open", byTheme("table"), true);
  styledToken("thead_open", byTheme("thead"), false);
  styledToken("th_open", byTheme("th"), false);
  styledToken("td_open", byTheme("td"), false);
  styledToken("hr", byTheme("hr"), true);
  styledToken("strong_open", byTheme("strong"), false);
  styledToken("em_open", byTheme("em"), false);
  styledToken("s_open", byTheme("del"), false);

  md.renderer.rules.image = (tokens, idx, _options, env) => {
    const renderEnv = env as RenderEnv;
    const token = tokens[idx];
    const raw = token.attrGet("src") ?? "";
    const alt = plainTextOfInline(token as never) || token.content || "";
    const title = token.attrGet("title");
    const preview = resolveImageSrc(raw, renderEnv);
    const isBlock = Boolean(token.meta && token.meta.blockImage);
    const caption = (title ?? "").trim() || alt.trim();

    const img =
      "<img" +
      attrs([
        ["src", preview],
        ["data-orig", raw],
        ["alt", alt],
        ["title", title],
        ["style", css(renderEnv.theme.img)],
      ]) +
      ">";

    if (isBlock && caption !== "") {
      return img + "<span" + inlineStyle(renderEnv.theme.figcaption) + ">" + escapeHtml(caption) + "</span>";
    }
    return img;
  };

  md.renderer.rules.code_inline = (tokens, idx, _options, env) => {
    const renderEnv = env as RenderEnv;
    const token = tokens[idx];
    return "<code" + inlineStyle(renderEnv.theme.codeInline) + ">" + escapeHtml(token.content) + "</code>";
  };

  const renderCodeBlock = (code: string, lang: string, line: number, env: RenderEnv) => {
    const trimmed = code.replace(/\n$/, "");
    const language = (lang || "").toLowerCase();
    let body: string;
    if (language && hljs.getLanguage(language)) {
      body = hljs.highlight(trimmed, { language, ignoreIllegals: true }).value;
    } else {
      body = escapeHtml(trimmed);
    }
    return (
      "<pre" +
      attrs([
        ["data-line", String(line)],
        ["style", css(env.theme.pre)],
      ]) +
      "><code" +
      inlineStyle(env.theme.codeBlock) +
      ">" +
      inlineHighlight(body, env.theme) +
      "</code></pre>\n"
    );
  };

  md.renderer.rules.fence = (tokens, idx, _options, env) => {
    const renderEnv = env as RenderEnv;
    const token = tokens[idx];
    const info = (token.info || "").trim().split(/\s+/)[0];
    const line = token.map ? token.map[0] : 0;
    return renderCodeBlock(token.content, info, line, renderEnv);
  };

  md.renderer.rules.code_block = (tokens, idx, _options, env) => {
    const renderEnv = env as RenderEnv;
    const token = tokens[idx];
    const line = token.map ? token.map[0] : 0;
    return renderCodeBlock(token.content, "", line, renderEnv);
  };

  return md;
}

const md = createMarkdown();

export function computeStats(source: string): DocStats {
  const text = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/[#>*_~\-|]/g, " ");
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length;
  const chars = text.replace(/\s/g, "").length;
  const words = cjk + latin;
  return { words, chars, minutes: Math.max(1, Math.ceil(words / 350)) };
}

/** 收集预览 HTML 中指向本地文件的图片地址 */
export function collectLocalImageSrcs(html: string): string[] {
  const out = new Set<string>();
  const pattern = /<img\b[^>]*\ssrc="(mdlocal:[^"]*)"/g;
  let match: RegExpExecArray | null = pattern.exec(html);
  while (match !== null) {
    // 远程图本身已是公网地址，不需要再上传
    if (match[1].indexOf(REMOTE_IMAGE_PREFIX) !== 0) out.add(match[1]);
    match = pattern.exec(html);
  }
  return Array.from(out);
}

/**
 * 清洗出可直接粘贴到微信编辑器的 HTML：
 * 去掉联动用的 data 属性；图片优先用上传后的公网地址，否则还原成 Markdown 中的原始地址。
 */
export function toCopyHtml(html: string, urlMap?: Record<string, string>): string {
  const withImages = html.replace(/<img\b[^>]*>/g, (tag: string) => {
    const srcMatch = /src="([^"]*)"/.exec(tag);
    const origMatch = /data-orig="([^"]*)"/.exec(tag);
    const src = srcMatch ? srcMatch[1] : "";
    const fallback = origMatch ? origMatch[1] : src;
    const mapped = urlMap && urlMap[src] ? urlMap[src] : fallback;
    let next = tag.replace(/\sdata-orig="[^"]*"/, "");
    if (srcMatch && mapped !== src) next = next.replace(/src="[^"]*"/, 'src="' + mapped + '"');
    return next;
  });
  return withImages.replace(/\sdata-(?:line|heading)="[^"]*"/g, "");
}

export function renderMarkdown(source: string, options: RenderOptions): RenderResult {
  md.set({ breaks: options.breaks ?? true });
  const env: RenderEnv = { toc: [], ids: new Map(), theme: options.theme, docPath: options.docPath ?? "" };
  const body = md.render(source ?? "", env);
  const section = "<section" + inlineStyle(options.theme.container) + ">" + body + "</section>";
  return {
    html: section,
    copyHtml: toCopyHtml(section),
    toc: env.toc,
    stats: computeStats(source ?? ""),
  };
}

/** 生成可独立分发的 HTML 文件（含阅读所需样式） */
export function buildStandaloneHtml(title: string, copyHtml: string): string {
  const head =
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="generator" content="MDMaster">' +
    '<meta name="author" content="北京云林智炬信息科技有限公司">' +
    "<title>" + escapeHtml(title) + "</title>" +
    '<style>html,body{margin:0;background:#f5f6f8}' +
    ".doc{max-width:760px;margin:0 auto;padding:40px 32px;background:#fff;min-height:100vh}" +
    "img{max-width:100%}</style>";
  return (
    "<!doctype html><html lang=\"zh-CN\"><head>" +
    head +
    "</head><body><div class=\"doc\">" +
    copyHtml +
    "</div>" +
    "<!-- Generated by MDMaster · Copyright (c) 北京云林智炬信息科技有限公司 -->" +
    "</body></html>"
  );
}
