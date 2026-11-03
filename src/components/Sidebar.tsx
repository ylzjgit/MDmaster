import { useMemo, useState } from "react";
import { FileTree } from "./FileTree";
import { filterTree } from "../lib/tree";
import type { TreeNode } from "../types";

interface SidebarProps {
  root: string | null;
  tree: TreeNode[];
  activePath: string | null;
  expanded: Record<string, boolean>;
  dirtyPaths: Set<string>;
  onOpenFolder: () => void;
  onToggleDir: (path: string) => void;
  onOpenFile: (node: TreeNode) => void;
  onNewFile: (dir: string) => void;
  onNewFolder: (dir: string) => void;
  onRefresh: () => void;
  onContextMenu: (event: React.MouseEvent, node: TreeNode) => void;
  onMove: (source: string, target: string) => void;
  onReveal: (path: string) => void;
  onCollapse: () => void;
}

export function Sidebar(props: SidebarProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => filterTree(props.tree, query), [props.tree, query]);
  const name = props.root ? props.root.split(/[\\/]/).filter(Boolean).pop() ?? props.root : null;

  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-title" title={props.root ?? ""}>
          <span className="sidebar-title-icon">📚</span>
          <span className="sidebar-title-text">{name ?? "未打开文件夹"}</span>
        </div>
        <div className="sidebar-actions">
          <button className="icon-button" onClick={props.onOpenFolder} title="打开文件夹 (Ctrl+O)">
            📂
          </button>
          <button className="icon-button" onClick={() => props.onNewFile(props.root ?? "")} title="新建文档 (Ctrl+N)" disabled={!props.root}>
            ＋
          </button>
          <button className="icon-button" onClick={() => props.onNewFolder(props.root ?? "")} title="新建文件夹" disabled={!props.root}>
            🗂
          </button>
          <button className="icon-button" onClick={props.onRefresh} title="刷新文件列表" disabled={!props.root}>
            ⟳
          </button>
          <button className="icon-button" onClick={props.onCollapse} title="收起文件栏 (Ctrl+Alt+B)">
            «
          </button>
        </div>
      </div>

      <div className="sidebar-search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文件…"
          spellCheck={false}
        />
        {query ? (
          <button className="search-clear" onClick={() => setQuery("")} title="清除">
            ✕
          </button>
        ) : null}
      </div>

      <div className="tree" onClick={(event) => event.stopPropagation()}>
        {props.root === null ? (
          <div className="sidebar-empty">
            <p>还没有打开工作区</p>
            <button className="primary-button" onClick={props.onOpenFolder}>
              打开文件夹
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="sidebar-empty">
            <p>{query ? "没有匹配的文件" : "这个文件夹是空的"}</p>
            {!query ? (
              <button className="ghost-button" onClick={() => props.onNewFile(props.root ?? "")}>
                新建第一个文档
              </button>
            ) : null}
          </div>
        ) : (
          <FileTree
            nodes={visible}
            rootPath={props.root}
            activePath={props.activePath}
            expanded={props.expanded}
            dirtyPaths={props.dirtyPaths}
            onToggleDir={props.onToggleDir}
            onOpenFile={props.onOpenFile}
            onContextMenu={props.onContextMenu}
            onMove={props.onMove}
            onReveal={props.onReveal}
          />
        )}
      </div>

      <button className="sidebar-foot" onClick={props.onOpenFolder}>
        <span>打开其他文件夹…</span>
        <span className="sidebar-foot-key">Ctrl+O</span>
      </button>
    </div>
  );
}
