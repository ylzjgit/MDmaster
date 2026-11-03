export interface Anchor {
  line: number;
  top: number;
  height: number;
}

function containerBase(container: HTMLElement): number {
  return container.getBoundingClientRect().top - container.scrollTop;
}

export function collectAnchors(container: HTMLElement): Anchor[] {
  const base = containerBase(container);
  const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-line]"));
  const anchors: Anchor[] = [];
  for (const node of nodes) {
    const line = Number(node.dataset.line);
    if (!Number.isFinite(line)) continue;
    const rect = node.getBoundingClientRect();
    anchors.push({ line, top: rect.top - base, height: rect.height });
  }
  anchors.sort((a, b) => a.line - b.line || a.top - b.top);
  return anchors;
}

export function lineAtScroll(anchors: Anchor[], scrollTop: number): { line: number; ratio: number } {
  if (anchors.length === 0) return { line: 0, ratio: 0 };
  let found = anchors[0];
  for (const anchor of anchors) {
    if (anchor.top <= scrollTop + 2) found = anchor;
    else break;
  }
  const ratio = found.height > 0 ? Math.min(1, Math.max(0, (scrollTop - found.top) / found.height)) : 0;
  return { line: found.line, ratio };
}

export function offsetForLine(anchors: Anchor[], line: number, ratio: number): number {
  if (anchors.length === 0) return 0;
  let found = anchors[0];
  for (const anchor of anchors) {
    if (anchor.line <= line) found = anchor;
    else break;
  }
  const safeRatio = Math.min(1, Math.max(0, ratio));
  return found.top + found.height * safeRatio;
}

/** 当前滚动位置上方最近的标题 id，用于目录高亮 */
export function activeHeadingId(container: HTMLElement): string | null {
  const base = containerBase(container);
  const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-heading]"));
  let found: string | null = null;
  for (const node of nodes) {
    const top = node.getBoundingClientRect().top - base;
    if (top <= container.scrollTop + 100) found = node.dataset.heading ?? null;
    else break;
  }
  return found;
}

/** 点击预览区：找到最近的数据行，用于把编辑器光标同步过去 */
export function lineFromElement(target: HTMLElement, container: HTMLElement): number | null {
  const node = target.closest<HTMLElement>("[data-line]");
  if (!node || !container.contains(node)) return null;
  const line = Number(node.dataset.line);
  return Number.isFinite(line) ? line : null;
}
