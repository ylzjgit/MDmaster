import type { DocStats } from "../lib/markdown";

interface StatusBarProps {
  root: string | null;
  activePath: string | null;
  stats: DocStats;
  cursor: { line: number; column: number };
  saveState: "idle" | "saving" | "saved" | "dirty";
  desktop: boolean;
  breaks: boolean;
  onBreaks: (value: boolean) => void;
}

function shortPath(path: string | null): string {
  if (!path) return "未打开文件";
  return path;
}

export function StatusBar({ root, activePath, stats, cursor, saveState, desktop, breaks, onBreaks }: StatusBarProps) {
  const saveText =
    saveState === "saving" ? "保存中…" : saveState === "dirty" ? "未保存" : saveState === "saved" ? "已保存" : "就绪";

  return (
    <div className="statusbar">
      <div className="status-left" title={shortPath(activePath)}>
        <span className="status-item status-path">{activePath ? shortPath(activePath) : root ?? "MDMaster"}</span>
      </div>
      <div className="status-right">
        <span className="status-item">{stats.words} 字</span>
        <span className="status-item">{stats.chars} 字符</span>
        <span className="status-item">约 {stats.minutes} 分钟</span>
        <span className="status-item">
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <label className="status-toggle" title="单个换行是否渲染为换行">
          <input type="checkbox" checked={breaks} onChange={(event) => onBreaks(event.target.checked)} />
          软换行
        </label>
        <span className={"status-item status-save status-" + saveState}>{saveText}</span>
        <span className="status-item status-mode">{desktop ? "桌面版" : "浏览器预览"}</span>
      </div>
    </div>
  );
}
