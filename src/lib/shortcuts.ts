import { COMMANDS } from "./commands";

export interface AppShortcut {
  keys: string;
  label: string;
}

export const APP_SHORTCUTS: AppShortcut[] = [
  { keys: "Ctrl+S", label: "保存当前文档" },
  { keys: "Ctrl+Shift+S", label: "保存所有文档" },
  { keys: "Ctrl+N", label: "新建文档" },
  { keys: "Ctrl+O", label: "打开文件夹" },
  { keys: "Ctrl+P", label: "快速跳转文件" },
  { keys: "Ctrl+W", label: "关闭当前标签" },
  { keys: "Ctrl+Shift+C", label: "复制渲染结果到公众号" },
  { keys: "Ctrl+Shift+E", label: "导出 HTML" },
  { keys: "Ctrl+Shift+V", label: "切换 编辑/分屏/预览" },
  { keys: "Ctrl+Alt+O", label: "显示/隐藏目录" },
  { keys: "Ctrl+Alt+B", label: "显示/隐藏文件栏" },
  { keys: "Ctrl+F", label: "在当前文档中查找" },
  { keys: "Ctrl+/", label: "打开快捷键面板" },
  { keys: "F12", label: "开发者工具" },
];

export interface ShortcutRow {
  keys: string;
  label: string;
  group: string;
}

export function shortcutRows(): ShortcutRow[] {
  const rows: ShortcutRow[] = COMMANDS.filter((command) => command.shortcut).map((command) => ({
    keys: command.shortcut!.display,
    label: command.label,
    group: "Markdown 语法",
  }));
  for (const item of APP_SHORTCUTS) {
    rows.push({ keys: item.keys, label: item.label, group: "应用操作" });
  }
  return rows;
}
