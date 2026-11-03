import { useState } from "react";
import type { TreeNode } from "../types";

interface FileTreeProps {
  nodes: TreeNode[];
  depth?: number;
  activePath: string | null;
  expanded: Record<string, boolean>;
  dirtyPaths: Set<string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (node: TreeNode) => void;
  onContextMenu: (event: React.MouseEvent, node: TreeNode) => void;
  onMove: (sourcePath: string, targetDir: string) => void;
  onReveal: (path: string) => void;
  rootPath: string;
}

export function FileTree(props: FileTreeProps) {
  const depth = props.depth ?? 0;
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  return (
    <>
      {props.nodes.map((node) => {
        const isDir = node.type === "dir";
        const isOpen = props.expanded[node.path] ?? false;
        const isActive = node.path === props.activePath;
        const dirty = props.dirtyPaths.has(node.path);

        if (isDir) {
          return (
            <div key={node.path} className="tree-branch">
              <div
                data-tree-path={node.path}
                className={"tree-row tree-dir" + (dropTarget === node.path ? " is-drop" : "")}
                style={{ paddingLeft: 8 + depth * 12 }}
                onClick={() => props.onToggleDir(node.path)}
                onContextMenu={(event) => props.onContextMenu(event, node)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropTarget(node.path);
                }}
                onDragLeave={() => setDropTarget((current) => (current === node.path ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  setDropTarget(null);
                  const source = event.dataTransfer.getData("text/plain");
                  if (source) props.onMove(source, node.path);
                }}
                title={node.path}
              >
                <span className={"tree-caret" + (isOpen ? " is-open" : "")}>▸</span>
                <span className="tree-folder-icon">{isOpen ? "📂" : "📁"}</span>
                <span className="tree-label">{node.name}</span>
              </div>
              {isOpen ? <FileTree {...props} nodes={node.children ?? []} depth={depth + 1} /> : null}
            </div>
          );
        }

        if (node.image) {
          return (
            <div
              key={node.path}
              data-tree-path={node.path}
              className="tree-row tree-file is-image"
              style={{ paddingLeft: 8 + depth * 12 + 16 }}
              onClick={() => props.onReveal(node.path)}
              onContextMenu={(event) => props.onContextMenu(event, node)}
              title={node.path + "（点击在资源管理器中显示）"}
            >
              <span className="tree-file-icon">🖼</span>
              <span className="tree-label">{node.name}</span>
            </div>
          );
        }

        return (
          <div
            key={node.path}
            data-tree-path={node.path}
            className={"tree-row tree-file" + (isActive ? " is-active" : "") + (node.markdown ? "" : " is-muted")}
            style={{ paddingLeft: 8 + depth * 12 + 16 }}
            onClick={() => props.onOpenFile(node)}
            onContextMenu={(event) => props.onContextMenu(event, node)}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", node.path);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const source = event.dataTransfer.getData("text/plain");
              if (source) props.onMove(source, props.rootPath);
            }}
            title={node.path}
          >
            <span className="tree-file-icon">{node.markdown ? "▤" : "≡"}</span>
            <span className="tree-label">{node.name}</span>
            {dirty ? <span className="tree-dirty" title="未保存" /> : null}
          </div>
        );
      })}
    </>
  );
}
