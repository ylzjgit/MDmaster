/**
 * 微信内联样式主题。
 * 关键设计：预览与“一键复制到公众号”使用同一份内联样式 HTML，
 * 所见即所得，粘贴到微信编辑器后视觉一致。
 */

export type Style = Record<string, string>;

export interface WeChatTheme {
  id: string;
  name: string;
  accent: string;
  container: Style;
  h1: Style;
  h2: Style;
  h3: Style;
  h4: Style;
  h5: Style;
  h6: Style;
  p: Style;
  strong: Style;
  em: Style;
  del: Style;
  a: Style;
  codeInline: Style;
  pre: Style;
  codeBlock: Style;
  blockquote: Style;
  ul: Style;
  ol: Style;
  li: Style;
  hr: Style;
  table: Style;
  thead: Style;
  th: Style;
  td: Style;
  img: Style;
  figure: Style;
  figcaption: Style;
  taskChecked: Style;
  taskUnchecked: Style;
  highlight: Record<string, Style>;
}

export function css(style: Style): string {
  const parts: string[] = [];
  for (const key of Object.keys(style)) {
    const value = style[key];
    if (value !== undefined && value !== null && value !== "") {
      parts.push(key + ":" + value);
    }
  }
  return parts.join(";");
}

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif';
const MONO_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace';

/** GitHub Light 风格的代码高亮配色（转为内联样式后微信可用） */
const HIGHLIGHT_LIGHT: Record<string, Style> = {
  "hljs-comment": { color: "#6a737d", "font-style": "italic" },
  "hljs-quote": { color: "#6a737d", "font-style": "italic" },
  "hljs-keyword": { color: "#d73a49" },
  "hljs-selector-tag": { color: "#d73a49" },
  "hljs-type": { color: "#d73a49" },
  "hljs-string": { color: "#032f62" },
  "hljs-attr": { color: "#005cc5" },
  "hljs-regexp": { color: "#032f62" },
  "hljs-number": { color: "#005cc5" },
  "hljs-literal": { color: "#005cc5" },
  "hljs-title": { color: "#6f42c1" },
  "hljs-section": { color: "#6f42c1" },
  "hljs-name": { color: "#22863a" },
  "hljs-built_in": { color: "#e36209" },
  "hljs-builtin-name": { color: "#e36209" },
  "hljs-variable": { color: "#e36209" },
  "hljs-template-variable": { color: "#e36209" },
  "hljs-params": { color: "#24292e" },
  "hljs-property": { color: "#005cc5" },
  "hljs-attribute": { color: "#005cc5" },
  "hljs-selector-id": { color: "#005cc5" },
  "hljs-selector-class": { color: "#005cc5" },
  "hljs-selector-attr": { color: "#005cc5" },
  "hljs-selector-pseudo": { color: "#005cc5" },
  "hljs-operator": { color: "#d73a49" },
  "hljs-punctuation": { color: "#24292e" },
  "hljs-function": { color: "#6f42c1" },
  "hljs-class": { color: "#6f42c1" },
  "hljs-formula": { color: "#032f62" },
  "hljs-char": { color: "#032f62" },
  "hljs-subst": { color: "#24292e" },
  "hljs-code": { color: "#032f62" },
  "hljs-doctag": { color: "#d73a49" },
  "hljs-meta-keyword": { color: "#d73a49" },
  "hljs-meta-string": { color: "#032f62" },
  "hljs-link": { color: "#005cc5", "text-decoration": "underline" },
  "hljs-char.escape": { color: "#032f62" },
  "hljs-meta": { color: "#6a737d" },
  "hljs-tag": { color: "#22863a" },
  "hljs-symbol": { color: "#e36209" },
  "hljs-bullet": { color: "#e36209" },
  "hljs-addition": { color: "#22863a", "background-color": "#f0fff4" },
  "hljs-deletion": { color: "#b31d28", "background-color": "#ffeef0" },
  "hljs-emphasis": { "font-style": "italic" },
  "hljs-strong": { "font-weight": "700" },
};

interface ThemeInput {
  id: string;
  name: string;
  accent: string;
  soft: string;
  heading: "bar" | "line";
  text?: string;
  muted?: string;
  border?: string;
  codeBg?: string;
}

function buildTheme(input: ThemeInput): WeChatTheme {
  const text = input.text ?? "#2b2f36";
  const muted = input.muted ?? "#7a828e";
  const border = input.border ?? "#e6e8ec";
  const codeBg = input.codeBg ?? "#f7f8fa";
  const accent = input.accent;

  const h2: Style =
    input.heading === "bar"
      ? {
          "font-size": "20px",
          "font-weight": "700",
          "line-height": "1.5",
          margin: "30px 0 14px",
          "padding-left": "10px",
          "border-left": "4px solid " + accent,
          color: text,
        }
      : {
          "font-size": "20px",
          "font-weight": "700",
          "line-height": "1.5",
          margin: "30px 0 14px",
          "padding-bottom": "8px",
          "border-bottom": "2px solid " + accent,
          color: text,
        };

  return {
    id: input.id,
    name: input.name,
    accent,
    container: {
      "font-family": FONT_FAMILY,
      "font-size": "16px",
      "line-height": "1.85",
      "letter-spacing": "0.02em",
      color: text,
      background: "#ffffff",
      "word-break": "break-word",
      "overflow-wrap": "break-word",
      "text-align": "left",
      padding: "0",
    },
    h1: {
      "font-size": "25px",
      "font-weight": "700",
      "line-height": "1.4",
      margin: "34px 0 16px",
      "padding-bottom": "10px",
      "border-bottom": "3px solid " + accent,
      color: text,
    },
    h2,
    h3: {
      "font-size": "17px",
      "font-weight": "700",
      "line-height": "1.5",
      margin: "26px 0 12px",
      color: text,
    },
    h4: { "font-size": "16px", "font-weight": "700", "line-height": "1.5", margin: "22px 0 10px", color: text },
    h5: { "font-size": "15px", "font-weight": "700", "line-height": "1.5", margin: "20px 0 10px", color: muted },
    h6: { "font-size": "14px", "font-weight": "700", "line-height": "1.5", margin: "18px 0 8px", color: muted },
    p: { margin: "16px 0", "font-size": "16px", "line-height": "1.85", color: text, "letter-spacing": "0.02em" },
    strong: { "font-weight": "700", color: "#14161a" },
    em: { "font-style": "italic", color: text },
    del: { "text-decoration": "line-through", color: muted },
    a: { color: accent, "text-decoration": "none", "border-bottom": "1px solid " + accent },
    codeInline: {
      "font-family": MONO_FAMILY,
      "font-size": "0.88em",
      color: "#c7254e",
      background: "#f6f7f9",
      padding: "2px 6px",
      margin: "0 2px",
      "border-radius": "4px",
      "border": "1px solid " + border,
    },
    pre: {
      margin: "18px 0",
      padding: "16px 18px",
      background: codeBg,
      "border-radius": "8px",
      border: "1px solid " + border,
      overflow: "auto",
    },
    codeBlock: {
      "font-family": MONO_FAMILY,
      "font-size": "13.5px",
      "line-height": "1.7",
      color: "#24292e",
      background: "transparent",
      padding: "0",
      margin: "0",
      "white-space": "pre-wrap",
      "word-break": "break-word",
      display: "block",
    },
    blockquote: {
      margin: "18px 0",
      padding: "12px 16px",
      "border-left": "4px solid " + accent,
      background: input.soft,
      color: "#5a6270",
      "border-radius": "0 6px 6px 0",
    },
    ul: { margin: "14px 0", "padding-left": "26px", "list-style-type": "disc" },
    ol: { margin: "14px 0", "padding-left": "26px", "list-style-type": "decimal" },
    li: { margin: "8px 0", "line-height": "1.8", color: text },
    hr: { border: "none", "border-top": "1px solid " + border, margin: "30px 0" },
    table: {
      "border-collapse": "collapse",
      "border-spacing": "0",
      width: "100%",
      margin: "18px 0",
      "font-size": "14px",
      "line-height": "1.6",
    },
    thead: { background: input.soft },
    th: {
      border: "1px solid " + border,
      padding: "9px 12px",
      "text-align": "left",
      "font-weight": "700",
      color: text,
      background: input.soft,
    },
    td: { border: "1px solid " + border, padding: "9px 12px", color: text },
    img: {
      "max-width": "100%",
      height: "auto",
      display: "block",
      margin: "0 auto",
      "border-radius": "6px",
    },
    figure: {
      margin: "20px 0",
      "text-align": "center",
      "line-height": "0",
    },
    figcaption: {
      display: "block",
      margin: "8px auto 0",
      "font-size": "13px",
      "line-height": "1.6",
      color: muted,
      "text-align": "center",
      "letter-spacing": "0.02em",
    },
    taskChecked: { color: accent, "font-weight": "700", "margin-right": "6px" },
    taskUnchecked: { color: muted, "margin-right": "6px" },
    highlight: HIGHLIGHT_LIGHT,
  };
}

export const THEMES: WeChatTheme[] = [
  buildTheme({ id: "simple", name: "简约黑白", accent: "#3f4652", soft: "#f4f5f7", heading: "line" }),
  buildTheme({ id: "wechat-green", name: "微信绿", accent: "#07c160", soft: "#eefbf3", heading: "bar" }),
  buildTheme({ id: "ocean", name: "科技蓝", accent: "#2563eb", soft: "#eff4ff", heading: "bar" }),
  buildTheme({ id: "sunset", name: "暖阳橙", accent: "#ff7a45", soft: "#fff4ee", heading: "line" }),
];

export const DEFAULT_THEME_ID = "wechat-green";

export function getTheme(id: string): WeChatTheme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[1];
}
