import { useEffect, useMemo, useRef, useState } from "react";
import type { FileEntry } from "../types";

interface CommandPaletteProps {
  files: FileEntry[];
  onSelect: (path: string) => void;
  onClose: () => void;
}

function score(entry: FileEntry, query: string): number {
  if (!query) return 1;
  const name = entry.name.toLowerCase();
  const path = entry.path.toLowerCase();
  const q = query.toLowerCase();
  if (name === q) return 1000;
  if (name.startsWith(q)) return 800;
  if (name.includes(q)) return 600;
  if (path.includes(q)) return 400;
  let index = 0;
  for (const char of name) {
    if (char === q[index]) index += 1;
    if (index === q.length) return 200;
  }
  return 0;
}

export function CommandPalette({ files, onSelect, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const results = useMemo(() => {
    return files
      .map((entry) => ({ entry, value: score(entry, query) }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value || a.entry.name.localeCompare(b.entry.name, "zh"))
      .slice(0, 40)
      .map((item) => item.entry);
  }, [files, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const commit = (index: number) => {
    const entry = results[index];
    if (entry) onSelect(entry.path);
  };

  return (
    <div className="modal-mask palette-mask" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          placeholder="输入文件名快速跳转…"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((current) => Math.min(current + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((current) => Math.max(current - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              commit(cursor);
            } else if (event.key === "Escape") {
              onClose();
            }
          }}
        />
        <div className="palette-list">
          {results.length === 0 ? (
            <div className="palette-empty">没有匹配的文件</div>
          ) : (
            results.map((entry, index) => (
              <button
                key={entry.path}
                type="button"
                className={"palette-item" + (index === cursor ? " is-active" : "")}
                onMouseEnter={() => setCursor(index)}
                onClick={() => commit(index)}
                title={entry.path}
              >
                <span className="palette-name">{entry.name}</span>
                <span className="palette-path">{entry.path}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
