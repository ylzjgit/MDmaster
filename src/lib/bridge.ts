import type { AppInfo, AppSettings, SavedImage, TreeNode, UploadResult, WorkspacePayload } from "../types";

export interface MdMasterBridge {
  isDesktop: boolean;
  info: () => Promise<AppInfo>;
  workspace: {
    open: () => Promise<WorkspacePayload | null>;
    load: (root: string) => Promise<WorkspacePayload>;
    refresh: () => Promise<WorkspacePayload | null>;
  };
  fs: {
    read: (path: string) => Promise<{ path: string; content: string; mtime: number }>;
    write: (path: string, content: string) => Promise<{ path: string; mtime: number }>;
    create: (dir: string, name: string, kind: "file" | "dir") => Promise<{ path: string; name: string }>;
    rename: (path: string, name: string) => Promise<{ path: string; oldPath: string; name: string }>;
    move: (path: string, dir: string) => Promise<{ path: string; oldPath?: string }>;
    remove: (path: string) => Promise<{ path: string }>;
    reveal: (path: string) => Promise<boolean>;
  };
  shell: {
    openExternal: (url: string) => Promise<boolean>;
  };
  clipboard: {
    writeHtml: (html: string, text: string) => Promise<boolean>;
    writeText: (text: string) => Promise<boolean>;
    readText: () => Promise<string>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  };
  images: {
    save: (payload: { buffer: ArrayBuffer; type: string; name: string; docPath: string }) => Promise<SavedImage>;
    upload: (srcs: string[]) => Promise<UploadResult>;
    testUpload: () => Promise<{ ok: boolean; url?: string; error?: string }>;
  };
  exportHtml: (defaultName: string, html: string) => Promise<string | null>;
  onFlushRequest?: (callback: () => void) => () => void;
  flushDone?: () => void;
  onWorkspaceChanged: (callback: (payload: { file: string }) => void) => () => void;
}

declare global {
  interface Window {
    mdmaster?: MdMasterBridge;
  }
}

/** 浏览器直开时的内存文件系统，方便不启动 Electron 也能看界面 */
function createMemoryBridge(): MdMasterBridge {
  const files = new Map<string, string>();
  const root = "/demo";
  files.set(root + "/欢迎使用.md", "# 欢迎使用 MDMaster\n\n这是浏览器预览模式。\n");
  files.set(root + "/示例文档.md", "## 示例\n\n在 Electron 中运行可使用完整文件管理功能。\n");

  const toTree = (): TreeNode[] => {
    const nodes: TreeNode[] = [];
    for (const path of files.keys()) {
      const name = path.slice(root.length + 1);
      nodes.push({ name, path, type: "file", markdown: true, size: files.get(path)?.length ?? 0 });
    }
    nodes.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    return nodes;
  };

  const payload = (): WorkspacePayload => ({ root, tree: toTree() });

  return {
    isDesktop: false,
    info: async () => ({ version: "0.1.0", platform: "web" }),
    workspace: {
      open: async () => payload(),
      load: async () => payload(),
      refresh: async () => payload(),
    },
    fs: {
      read: async (path) => ({ path, content: files.get(path) ?? "", mtime: Date.now() }),
      write: async (path, content) => {
        files.set(path, content);
        return { path, mtime: Date.now() };
      },
      create: async (dir, name, kind) => {
        const path = dir + "/" + name;
        if (kind === "file") files.set(path, "");
        return { path, name };
      },
      rename: async (path, name) => {
        const content = files.get(path) ?? "";
        files.delete(path);
        const next = path.slice(0, path.lastIndexOf("/")) + "/" + name;
        files.set(next, content);
        return { path: next, oldPath: path, name };
      },
      move: async (path, dir) => {
        const content = files.get(path) ?? "";
        files.delete(path);
        const next = dir + "/" + path.slice(path.lastIndexOf("/") + 1);
        files.set(next, content);
        return { path: next, oldPath: path };
      },
      remove: async (path) => {
        files.delete(path);
        return { path };
      },
      reveal: async () => false,
    },
    shell: { openExternal: async (url) => Boolean(window.open(url)) },
    clipboard: {
      writeHtml: async (html) => {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([html.replace(/<[^>]+>/g, "")], { type: "text/plain" }),
          }),
        ]);
        return true;
      },
      writeText: async (text) => {
        await navigator.clipboard.writeText(text);
        return true;
      },
      readText: async () => navigator.clipboard.readText(),
    },
    settings: {
      get: async () => ({
        imageDir: "assets",
        uploadProvider: "none" as const,
        wechatAppId: "",
        wechatAppSecret: "",
        customUploadUrl: "",
        customFieldName: "file",
        customUrlPath: "data.url",
      }),
      set: async (patch) => ({
        imageDir: "assets",
        uploadProvider: "none" as const,
        wechatAppId: "",
        wechatAppSecret: "",
        customUploadUrl: "",
        customFieldName: "file",
        customUrlPath: "data.url",
        ...patch,
      }),
    },
    images: {
      save: async () => {
        throw new Error("浏览器预览模式不支持保存图片，请使用桌面版");
      },
      upload: async () => ({ map: {}, errors: ["浏览器预览模式不支持上传图片"] }),
      testUpload: async () => ({ ok: false, error: "浏览器预览模式不支持上传图片" }),
    },
    exportHtml: async () => null,
    onWorkspaceChanged: () => () => undefined,
  };
}

export const bridge: MdMasterBridge = window.mdmaster ?? createMemoryBridge();

export const isDesktop = bridge.isDesktop;
