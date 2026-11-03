import { COMMANDS } from "../lib/commands";
import type { CommandId } from "../lib/commands";
import { THEMES } from "../lib/theme";
import type { ViewMode } from "../types";

interface ToolbarProps {
  disabled: boolean;
  viewMode: ViewMode;
  themeId: string;
  tocOpen: boolean;
  onCommand: (id: CommandId) => void;
  onViewMode: (mode: ViewMode) => void;
  onTheme: (id: string) => void;
  onToggleToc: () => void;
}

const GROUPS: CommandId[][] = [
  ["h1", "h2", "h3"],
  ["bold", "italic", "strike", "codeInline"],
  ["quote", "ul", "ol", "task"],
  ["codeBlock", "table", "link", "image", "hr"],
];

const VIEW_MODES: Array<{ id: ViewMode; label: string }> = [
  { id: "editor", label: "编辑" },
  { id: "split", label: "分屏" },
  { id: "preview", label: "预览" },
];

export function Toolbar(props: ToolbarProps) {
  const byId = (id: CommandId) => COMMANDS.find((command) => command.id === id)!;

  return (
    <div className="toolbar">
      <div className="toolbar-scroll">
        {GROUPS.map((group, index) => (
          <div className="tool-group" key={index}>
            {group.map((id) => {
              const command = byId(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={"tool-button tool-" + id}
                  disabled={props.disabled}
                  onClick={() => props.onCommand(id)}
                  title={command.label + (command.shortcut ? " (" + command.shortcut.display + ")" : "")}
                >
                  {command.text}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="toolbar-right">
        <select className="theme-select" value={props.themeId} onChange={(event) => props.onTheme(event.target.value)} title="公众号主题">
          {THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>

        <div className="segmented">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={props.viewMode === mode.id ? "is-active" : ""}
              onClick={() => props.onViewMode(mode.id)}
              title={"切换到" + mode.label}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={"icon-button" + (props.tocOpen ? " is-active" : "")}
          onClick={props.onToggleToc}
          title="显示/隐藏目录 (Ctrl+Alt+O)"
        >
          ☰
        </button>
      </div>
    </div>
  );
}
