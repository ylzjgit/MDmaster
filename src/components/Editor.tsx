import { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { Ref } from "react";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  placeholder,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { bracketMatching, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { COMMANDS, runCommand } from "../lib/commands";
import type { CommandId } from "../lib/commands";
import { insertBlock } from "../lib/transforms";

export interface EditorHandle {
  focus: () => void;
  run: (id: CommandId) => void;
  scrollToPosition: (line: number, ratio: number) => void;
  getScrollPosition: () => { line: number; ratio: number };
  setCursorLine: (line: number) => void;
  scrollTop: () => number;
  insertMarkdown: (text: string) => void;
}

interface EditorProps {
  value: string;
  docKey: string;
  onChange: (value: string) => void;
  onCursor: (position: { line: number; column: number }) => void;
  onScroll: () => void;
  onPasteImages: (files: File[]) => void;
  ref?: Ref<EditorHandle>;
}

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.45em", fontWeight: "700", lineHeight: "1.5" },
  { tag: tags.heading2, fontSize: "1.28em", fontWeight: "700", lineHeight: "1.5" },
  { tag: tags.heading3, fontSize: "1.14em", fontWeight: "700" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700", color: "#111418" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "#8b929c" },
  { tag: tags.link, color: "#2563eb" },
  { tag: tags.url, color: "#2563eb", textDecoration: "underline" },
  { tag: tags.monospace, color: "#c7254e", background: "#f4f5f7", borderRadius: "3px" },
  { tag: tags.quote, color: "#5c6470", fontStyle: "italic" },
  { tag: tags.list, color: "#3b6ef6" },
  { tag: tags.processingInstruction, color: "#a5acb8" },
  { tag: tags.contentSeparator, color: "#c4c9d2" },
]);

const editorTheme = EditorView.theme(
  {
    "&": { height: "100%", backgroundColor: "transparent", fontSize: "14.5px" },
    ".cm-scroller": {
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, "PingFang SC", "Microsoft YaHei", monospace',
      lineHeight: "1.8",
      overflow: "auto",
    },
    ".cm-content": { padding: "14px 0 45vh", caretColor: "#3b6ef6" },
    ".cm-line": { padding: "0 18px" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      border: "none",
      color: "#b6bcc6",
      fontSize: "12px",
      paddingLeft: "6px",
      userSelect: "none",
    },
    ".cm-activeLine": { backgroundColor: "rgba(59,110,246,0.045)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#3b6ef6" },
    "&.cm-focused": { outline: "none" },
    ".cm-selectionBackground, .cm-content ::selection": { backgroundColor: "rgba(59,110,246,0.16)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#3b6ef6", borderLeftWidth: "2px" },
    ".cm-searchMatch": { backgroundColor: "rgba(255,196,0,0.35)" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgba(255,196,0,0.6)" },
    ".cm-panels": { backgroundColor: "#f7f8fa", borderColor: "#e6e8ec", fontSize: "12px" },
    ".cm-tooltip": { borderRadius: "8px", border: "1px solid #e6e8ec", boxShadow: "0 8px 24px rgba(16,24,40,.12)" },
  },
  { dark: false }
);

function buildExtensions(
  onChange: (value: string) => void,
  onCursor: (position: { line: number; column: number }) => void,
  onScroll: () => void,
  onPasteImages: (files: File[]) => void
) {
  const commandKeys = COMMANDS.filter((command) => command.shortcut).map((command) => ({
    key: command.shortcut!.cm,
    preventDefault: true,
    run: (view: EditorView) => {
      runCommand(view, command.id);
      return true;
    },
  }));

  return [
    lineNumbers(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSelectionMatches(),
    bracketMatching(),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(true),
    syntaxHighlighting(markdownHighlight),
    markdown(),
    editorTheme,
    placeholder("开始写作…  输入 # + 空格 创建标题，或使用右侧工具栏"),
    keymap.of([...commandKeys, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
      if (update.selectionSet || update.docChanged) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        onCursor({ line: line.number, column: head - line.from + 1 });
      }
    }),
    EditorView.domEventHandlers({
      scroll: () => {
        onScroll();
      },
      paste: (event) => {
        const files = imageFilesFrom(event.clipboardData);
        if (files.length === 0) return false;
        event.preventDefault();
        onPasteImages(files);
        return true;
      },
      drop: (event, view) => {
        const files = imageFilesFrom(event.dataTransfer);
        if (files.length === 0) return false;
        event.preventDefault();
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (position !== null) view.dispatch({ selection: { anchor: position } });
        onPasteImages(files);
        return true;
      },
    }),
  ];
}

function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith("image/")) files.push(file);
  }
  if (files.length === 0) {
    for (const item of Array.from(data.items ?? [])) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file && file.type.startsWith("image/")) files.push(file);
    }
  }
  return files;
}

export function Editor({ value, docKey, onChange, onCursor, onScroll, onPasteImages, ref }: EditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const keyRef = useRef(docKey);
  const callbacks = useRef({ onChange, onCursor, onScroll, onPasteImages });
  callbacks.current = { onChange, onCursor, onScroll, onPasteImages };

  const extensions = useMemo(
    () =>
      buildExtensions(
        (next) => callbacks.current.onChange(next),
        (position) => callbacks.current.onCursor(position),
        () => callbacks.current.onScroll(),
        (files) => callbacks.current.onPasteImages(files)
      ),
    []
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: host,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (keyRef.current !== docKey) {
      keyRef.current = docKey;
      view.setState(EditorState.create({ doc: value, extensions }));
      view.scrollDOM.scrollTop = 0;
      return;
    }
    if (view.state.doc.toString() !== value) {
      const head = Math.min(view.state.selection.main.head, value.length);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: { anchor: head },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, docKey]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => viewRef.current?.focus(),
      run: (id: CommandId) => {
        const view = viewRef.current;
        if (view) runCommand(view, id);
      },
      scrollToPosition: (line: number, ratio: number) => {
        const view = viewRef.current;
        if (!view) return;
        const total = view.state.doc.lines;
        const target = Math.min(Math.max(1, Math.round(line)), total);
        const lineInfo = view.state.doc.line(target);
        const block = view.lineBlockAt(lineInfo.from);
        const safeRatio = Math.min(1, Math.max(0, ratio));
        view.scrollDOM.scrollTop = Math.max(0, block.top + block.height * safeRatio);
      },
      getScrollPosition: () => {
        const view = viewRef.current;
        if (!view) return { line: 1, ratio: 0 };
        const top = view.scrollDOM.scrollTop;
        const block = view.lineBlockAtHeight(top);
        const line = view.state.doc.lineAt(block.from).number;
        const ratio = block.height > 0 ? Math.min(1, Math.max(0, (top - block.top) / block.height)) : 0;
        return { line, ratio };
      },
      setCursorLine: (line: number) => {
        const view = viewRef.current;
        if (!view) return;
        const total = view.state.doc.lines;
        const target = Math.min(Math.max(1, Math.round(line)), total);
        const lineInfo = view.state.doc.line(target);
        view.dispatch({ selection: { anchor: lineInfo.from }, scrollIntoView: true });
        view.focus();
      },
      scrollTop: () => viewRef.current?.scrollDOM.scrollTop ?? 0,
      insertMarkdown: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const state = view.state;
        const edit = insertBlock(
          { text: state.doc.toString(), start: state.selection.main.from, end: state.selection.main.to },
          text
        );
        view.dispatch({
          changes: { from: 0, to: state.doc.length, insert: edit.text },
          selection: { anchor: edit.start, head: edit.end },
          scrollIntoView: true,
          userEvent: "input.paste",
        });
        view.focus();
      },
    }),
    []
  );

  return <div className="editor-host" ref={hostRef} />;
}
