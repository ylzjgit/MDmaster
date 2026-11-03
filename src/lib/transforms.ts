/**
 * 纯函数文本变换层：不依赖 CodeMirror / DOM，可直接单元测试。
 * 输入选区 ({text,start,end})，输出新文本与新选区。
 */

export interface Sel {
  text: string;
  start: number;
  end: number;
}

export interface Edit {
  text: string;
  start: number;
  end: number;
}

/** 反引号（避免在源码中直接书写，方便围栏处理） */
const TICK = String.fromCharCode(96);
export const FENCE = TICK + TICK + TICK;

export function wrapInline(sel: Sel, open: string, close: string, placeholder: string): Edit {
  const { text, start, end } = sel;
  const inner = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);

  if (inner.length > 0 && before.endsWith(open) && after.startsWith(close)) {
    const caret = start - open.length;
    return {
      text: before.slice(0, before.length - open.length) + inner + after.slice(close.length),
      start: caret,
      end: caret + inner.length,
    };
  }

  if (
    inner.length >= open.length + close.length &&
    inner.startsWith(open) &&
    inner.endsWith(close)
  ) {
    const stripped = inner.slice(open.length, inner.length - close.length);
    return { text: before + stripped + after, start, end: start + stripped.length };
  }

  if (inner.length === 0) {
    const inserted = open + placeholder + close;
    const caret = start + open.length;
    return { text: before + inserted + after, start: caret, end: caret + placeholder.length };
  }

  return {
    text: before + open + inner + close + after,
    start: start + open.length,
    end: end + open.length,
  };
}

export function lineRange(text: string, start: number, end: number): { from: number; to: number } {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  let to = text.indexOf("\n", end);
  if (to === -1) to = text.length;
  return { from, to };
}

export function toggleLinePrefix(
  sel: Sel,
  test: RegExp,
  makePrefix: (index: number) => string
): Edit {
  const { text, start, end } = sel;
  const { from, to } = lineRange(text, start, end);
  const lines = text.slice(from, to).split("\n");
  const filled = lines.filter((line) => line.trim().length > 0);
  const allHave = filled.length > 0 && filled.every((line) => test.test(line));

  let index = 0;
  const out = lines.map((line) => {
    if (allHave) return line.replace(test, "");
    if (line.trim().length === 0) return line;
    const prefix = makePrefix(index);
    index += 1;
    return prefix + line;
  });

  const replaced = out.join("\n");
  return { text: text.slice(0, from) + replaced + text.slice(to), start: from, end: from + replaced.length };
}

const HEADING_PREFIX = /^[ \t]{0,3}#{1,6}[ \t]+/;

export function setHeading(sel: Sel, level: number): Edit {
  const { text, start, end } = sel;
  const { from, to } = lineRange(text, start, end);
  const lines = text.slice(from, to).split("\n");
  const out = lines.map((line) => {
    const bare = line.replace(HEADING_PREFIX, "");
    if (level <= 0) return bare;
    return "#".repeat(Math.min(6, level)) + " " + bare;
  });
  const replaced = out.join("\n");
  return { text: text.slice(0, from) + replaced + text.slice(to), start: from, end: from + replaced.length };
}

export function wrapFence(sel: Sel, lang: string): Edit {
  const { text, start, end } = sel;
  const { from, to } = lineRange(text, start, end);
  const block = text.slice(from, to);
  const lines = block.split("\n");
  const isFenced =
    lines.length >= 2 && lines[0].trim().startsWith(FENCE) && lines[lines.length - 1].trim() === FENCE;

  if (isFenced) {
    const inner = lines.slice(1, lines.length - 1).join("\n");
    return { text: text.slice(0, from) + inner + text.slice(to), start: from, end: from + inner.length };
  }

  const opener = FENCE + lang;
  const fenced = opener + "\n" + block + "\n" + FENCE;
  const innerStart = from + opener.length + 1;
  return {
    text: text.slice(0, from) + fenced + text.slice(to),
    start: innerStart,
    end: innerStart + block.length,
  };
}

export function insertBlock(sel: Sel, block: string): Edit {
  const { text, start } = sel;
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const before = text.slice(from, start);
  let insertAt: number;
  if (before.trim() === "") {
    insertAt = from;
  } else {
    const lineEnd = text.indexOf("\n", start);
    insertAt = lineEnd === -1 ? text.length : lineEnd + 1;
  }
  const tail = text.slice(insertAt);
  const lead = insertAt > 0 && text[insertAt - 1] !== "\n" ? "\n" : "";
  const trail = tail.length > 0 && !tail.startsWith("\n") ? "\n" : "";
  const payload = lead + block + trail;
  const offset = insertAt + lead.length;
  return {
    text: text.slice(0, insertAt) + payload + tail,
    start: offset,
    end: offset + block.length,
  };
}

export function insertLink(sel: Sel, label = "链接文字", url = "https://"): Edit {
  const { text, start, end } = sel;
  const inner = text.slice(start, end);
  const text2 = inner.length > 0 ? inner : label;
  const inserted = "[" + text2 + "](" + url + ")";
  const body = text.slice(0, start) + inserted + text.slice(end);
  if (inner.length > 0) {
    const urlStart = start + text2.length + 3;
    return { text: body, start: urlStart, end: urlStart + url.length };
  }
  return { text: body, start: start + 1, end: start + 1 + text2.length };
}

const URL_LIKE = /^(https?:\/\/|data:|file:|\/)/i;

export function insertImage(sel: Sel, alt = "图片描述", src = "https://"): Edit {
  const { text, start, end } = sel;
  const inner = text.slice(start, end).trim();
  if (inner.length > 0 && URL_LIKE.test(inner)) {
    const inserted = "![" + alt + "](" + inner + ")";
    return { text: text.slice(0, start) + inserted + text.slice(end), start: start + 2, end: start + 2 + alt.length };
  }
  const altText = inner.length > 0 ? inner : alt;
  const inserted = "![" + altText + "](" + src + ")";
  const body = text.slice(0, start) + inserted + text.slice(end);
  const srcStart = start + altText.length + 4;
  return { text: body, start: srcStart, end: srcStart + src.length };
}

export function insertTable(sel: Sel, rows = 2, cols = 3): Edit {
  const header = "| " + Array.from({ length: cols }, (_v, i) => "列" + (i + 1)).join(" | ") + " |";
  const divider = "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
  const body = Array.from(
    { length: rows },
    () => "| " + Array.from({ length: cols }, () => "内容").join(" | ") + " |"
  );
  return insertBlock(sel, [header, divider, ...body].join("\n"));
}

export function insertHr(sel: Sel): Edit {
  return insertBlock(sel, "---");
}
