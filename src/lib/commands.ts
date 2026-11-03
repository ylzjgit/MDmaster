import type { EditorView } from "@codemirror/view";
import * as T from "./transforms";
import type { Sel } from "./transforms";

export type CommandId =
  | "bold"
  | "italic"
  | "strike"
  | "codeInline"
  | "link"
  | "image"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "paragraph"
  | "quote"
  | "ul"
  | "ol"
  | "task"
  | "codeBlock"
  | "table"
  | "hr";

export interface ShortcutSpec {
  /** 展示用文案，例如 Ctrl+B */
  display: string;
  /** CodeMirror keymap 语法，例如 Mod-b */
  cm: string;
}

export interface CommandDef {
  id: CommandId;
  label: string;
  group: "format" | "block" | "insert";
  shortcut?: ShortcutSpec;
  /** 工具栏显示文本 */
  text: string;
  title?: string;
}

export const COMMANDS: CommandDef[] = [
  { id: "h1", label: "一级标题", group: "block", text: "H1", shortcut: { display: "Ctrl+1", cm: "Mod-1" } },
  { id: "h2", label: "二级标题", group: "block", text: "H2", shortcut: { display: "Ctrl+2", cm: "Mod-2" } },
  { id: "h3", label: "三级标题", group: "block", text: "H3", shortcut: { display: "Ctrl+3", cm: "Mod-3" } },
  { id: "h4", label: "四级标题", group: "block", text: "H4", shortcut: { display: "Ctrl+4", cm: "Mod-4" } },
  { id: "h5", label: "五级标题", group: "block", text: "H5", shortcut: { display: "Ctrl+5", cm: "Mod-5" } },
  { id: "h6", label: "六级标题", group: "block", text: "H6", shortcut: { display: "Ctrl+6", cm: "Mod-6" } },
  { id: "paragraph", label: "正文（清除标题）", group: "block", text: "正文", shortcut: { display: "Ctrl+0", cm: "Mod-0" } },
  { id: "bold", label: "加粗", group: "format", text: "B", shortcut: { display: "Ctrl+B", cm: "Mod-b" } },
  { id: "italic", label: "斜体", group: "format", text: "I", shortcut: { display: "Ctrl+I", cm: "Mod-i" } },
  { id: "strike", label: "删除线", group: "format", text: "S", shortcut: { display: "Ctrl+Shift+X", cm: "Mod-Shift-x" } },
  { id: "codeInline", label: "行内代码", group: "format", text: "代码", shortcut: { display: "Ctrl+E", cm: "Mod-e" } },
  { id: "link", label: "超链接", group: "format", text: "链接", shortcut: { display: "Ctrl+K", cm: "Mod-k" } },
  { id: "quote", label: "引用", group: "block", text: "引用", shortcut: { display: "Ctrl+Shift+Q", cm: "Mod-Shift-q" } },
  { id: "ul", label: "无序列表", group: "block", text: "• 列表", shortcut: { display: "Ctrl+Shift+U", cm: "Mod-Shift-u" } },
  { id: "ol", label: "有序列表", group: "block", text: "1. 列表", shortcut: { display: "Ctrl+Shift+O", cm: "Mod-Shift-o" } },
  { id: "task", label: "任务列表", group: "block", text: "☑ 任务", shortcut: { display: "Ctrl+Shift+T", cm: "Mod-Shift-t" } },
  { id: "codeBlock", label: "代码块", group: "insert", text: "</>代码块", shortcut: { display: "Ctrl+Shift+K", cm: "Mod-Shift-k" } },
  { id: "table", label: "表格", group: "insert", text: "表格", shortcut: { display: "Ctrl+Shift+M", cm: "Mod-Shift-m" } },
  { id: "image", label: "图片", group: "insert", text: "图片", shortcut: { display: "Ctrl+Shift+I", cm: "Mod-Shift-i" } },
  { id: "hr", label: "分隔线", group: "insert", text: "分隔线", shortcut: { display: "Ctrl+Shift+H", cm: "Mod-Shift-h" } },
];

const QUOTE_TEST = /^[ \t]{0,3}>[ \t]?/;
const UL_TEST = /^[ \t]{0,3}[-*+][ \t]+/;
const OL_TEST = /^[ \t]{0,3}\d+\.[ \t]+/;
const TASK_TEST = /^[ \t]{0,3}[-*+][ \t]+\[[ xX]\][ \t]+/;

function selectionOf(view: EditorView): Sel {
  const state = view.state;
  const range = state.selection.main;
  return { text: state.doc.toString(), start: range.from, end: range.to };
}

function applyEdit(view: EditorView, edit: T.Edit): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: edit.text },
    selection: { anchor: edit.start, head: edit.end },
    scrollIntoView: true,
    userEvent: "input.command",
  });
  view.focus();
}

export function runCommand(view: EditorView, id: CommandId): void {
  const sel = selectionOf(view);
  switch (id) {
    case "bold":
      applyEdit(view, T.wrapInline(sel, "**", "**", "加粗文字"));
      return;
    case "italic":
      applyEdit(view, T.wrapInline(sel, "*", "*", "斜体文字"));
      return;
    case "strike":
      applyEdit(view, T.wrapInline(sel, "~~", "~~", "删除文字"));
      return;
    case "codeInline":
      applyEdit(view, T.wrapInline(sel, String.fromCharCode(96), String.fromCharCode(96), "code"));
      return;
    case "link":
      applyEdit(view, T.insertLink(sel));
      return;
    case "image":
      applyEdit(view, T.insertImage(sel));
      return;
    case "h1":
      applyEdit(view, T.setHeading(sel, 1));
      return;
    case "h2":
      applyEdit(view, T.setHeading(sel, 2));
      return;
    case "h3":
      applyEdit(view, T.setHeading(sel, 3));
      return;
    case "h4":
      applyEdit(view, T.setHeading(sel, 4));
      return;
    case "h5":
      applyEdit(view, T.setHeading(sel, 5));
      return;
    case "h6":
      applyEdit(view, T.setHeading(sel, 6));
      return;
    case "paragraph":
      applyEdit(view, T.setHeading(sel, 0));
      return;
    case "quote":
      applyEdit(view, T.toggleLinePrefix(sel, QUOTE_TEST, () => "> "));
      return;
    case "ul":
      applyEdit(view, T.toggleLinePrefix(sel, UL_TEST, () => "- "));
      return;
    case "ol":
      applyEdit(view, T.toggleLinePrefix(sel, OL_TEST, (index) => index + 1 + ". "));
      return;
    case "task":
      applyEdit(view, T.toggleLinePrefix(sel, TASK_TEST, () => "- [ ] "));
      return;
    case "codeBlock":
      applyEdit(view, T.wrapFence(sel, ""));
      return;
    case "table":
      applyEdit(view, T.insertTable(sel, 2, 3));
      return;
    case "hr":
      applyEdit(view, T.insertHr(sel));
      return;
    default:
      return;
  }
}
