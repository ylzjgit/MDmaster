import { useEffect, useRef } from "react";
import type { TocItem } from "../lib/markdown";

interface TocProps {
  items: TocItem[];
  activeId: string | null;
  onJump: (line: number) => void;
  onClose: () => void;
}

export function Toc({ items, activeId, onJump, onClose }: TocProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !activeId) return;
    const active = list.querySelector<HTMLElement>(".toc-item.is-active");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  return (
    <aside className="toc-pane">
      <div className="toc-head">
        <span className="toc-title">目录</span>
        <span className="toc-count">{items.length}</span>
        <button className="icon-button" onClick={onClose} title="收起目录 (Ctrl+Alt+O)">
          ✕
        </button>
      </div>
      <div className="toc-list" ref={listRef}>
        {items.length === 0 ? (
          <p className="toc-empty">还没有标题。用 Ctrl+1 ~ Ctrl+6 添加标题后，目录会自动生成。</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              data-toc-line={item.line}
              className={"toc-item" + (item.id === activeId ? " is-active" : "") + " toc-level-" + item.level}
              style={{ paddingLeft: 12 + (item.level - 1) * 12 }}
              onClick={() => onJump(item.line)}
              title={item.text}
            >
              {item.text}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
