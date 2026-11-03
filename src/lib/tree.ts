import type { FileEntry, TreeNode } from "../types";

export function flattenFiles(nodes: TreeNode[]): FileEntry[] {
  const out: FileEntry[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.type === "dir") {
        walk(node.children ?? []);
      } else {
        const index = node.path.lastIndexOf("/") >= 0 ? node.path.lastIndexOf("/") : node.path.lastIndexOf(String.fromCharCode(92));
        out.push({
          path: node.path,
          name: node.name,
          dir: index > 0 ? node.path.slice(0, index) : "",
          markdown: Boolean(node.markdown),
        });
      }
    }
  };
  walk(nodes);
  return out;
}

export function allDirPaths(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.type === "dir") {
        out.push(node.path);
        walk(node.children ?? []);
      }
    }
  };
  walk(nodes);
  return out;
}

export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "dir") {
      const children = filterTree(node.children ?? [], query);
      if (children.length > 0 || node.name.toLowerCase().includes(q)) out.push({ ...node, children });
    } else if (node.name.toLowerCase().includes(q)) {
      out.push(node);
    }
  }
  return out;
}

export function topLevelDirState(nodes: TreeNode[]): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const node of nodes) {
    if (node.type === "dir" && (node.children?.length ?? 0) > 0) state[node.path] = true;
  }
  return state;
}

export function baseName(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf(String.fromCharCode(92)));
  return index >= 0 ? path.slice(index + 1) : path;
}

export function parentDir(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf(String.fromCharCode(92)));
  return index > 0 ? path.slice(0, index) : path;
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("/") ? "/" : String.fromCharCode(92);
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}
