import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "./components/Editor";
import type { EditorHandle } from "./components/Editor";
import { Preview } from "./components/Preview";
import type { PreviewHandle, PreviewScrollState } from "./components/Preview";
import { Toc } from "./components/Toc";
import { Tabs } from "./components/Tabs";
import { Toolbar } from "./components/Toolbar";
import { StatusBar } from "./components/StatusBar";
import { Sidebar } from "./components/Sidebar";
import { ContextMenu } from "./components/ContextMenu";
import type { MenuItem } from "./components/ContextMenu";
import { ConfirmDialog, PromptDialog, SettingsDialog, ShortcutDialog } from "./components/Dialogs";
import { CommandPalette } from "./components/CommandPalette";
import { Welcome } from "./components/Welcome";
import { Toast } from "./components/Toast";
import { bridge, isDesktop } from "./lib/bridge";
import { copyRichHtml, htmlToPlainText } from "./lib/clipboard";
import { buildStandaloneHtml, collectLocalImageSrcs, renderMarkdown, toCopyHtml } from "./lib/markdown";
import { getTheme, DEFAULT_THEME_ID } from "./lib/theme";
import { COMMANDS } from "./lib/commands";
import type { CommandId } from "./lib/commands";
import { flattenFiles, topLevelDirState } from "./lib/tree";
import { loadJSON, loadString, saveJSON, saveString } from "./lib/storage";
import type { AppSettings, DocTab, TreeNode, ViewMode } from "./types";

const DEFAULT_SETTINGS: AppSettings = {
  imageDir: "assets",
  uploadProvider: "wechat",
  wechatAppId: "",
  wechatAppSecret: "",
  customUploadUrl: "",
  customFieldName: "file",
  customUrlPath: "data.url",
};

const AUTOSAVE_DELAY = 700;
const SYNC_LOCK_MS = 160;

type PromptState =
  | { kind: "newFile"; dir: string }
  | { kind: "newFolder"; dir: string }
  | { kind: "rename"; node: TreeNode }
  | null;

interface ToastState {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
}

interface ContextState {
  x: number;
  y: number;
  node: TreeNode;
}

interface ParsedShortcut {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

function parseShortcut(display: string): ParsedShortcut {
  const parts = display.split("+");
  const key = (parts.pop() ?? "").trim().toLowerCase();
  return {
    key,
    ctrl: parts.includes("Ctrl"),
    shift: parts.includes("Shift"),
    alt: parts.includes("Alt"),
  };
}

function matches(event: KeyboardEvent, spec: ParsedShortcut): boolean {
  return (
    event.key.toLowerCase() === spec.key &&
    event.ctrlKey === spec.ctrl &&
    event.shiftKey === spec.shift &&
    event.altKey === spec.alt
  );
}

const COMMAND_BY_SHORTCUT = COMMANDS.filter((command) => command.shortcut).map((command) => ({
  id: command.id,
  spec: parseShortcut(command.shortcut!.display),
}));

const SAVE_SPEC = parseShortcut("Ctrl+S");
const SAVE_ALL_SPEC = parseShortcut("Ctrl+Shift+S");
const NEW_SPEC = parseShortcut("Ctrl+N");
const OPEN_SPEC = parseShortcut("Ctrl+O");
const PALETTE_SPEC = parseShortcut("Ctrl+P");
const CLOSE_SPEC = parseShortcut("Ctrl+W");
const COPY_SPEC = parseShortcut("Ctrl+Shift+C");
const EXPORT_SPEC = parseShortcut("Ctrl+Shift+E");
const VIEW_SPEC = parseShortcut("Ctrl+Shift+V");
const TOC_SPEC = parseShortcut("Ctrl+Alt+O");
const SIDEBAR_SPEC = parseShortcut("Ctrl+Alt+B");
const HELP_SPEC = parseShortcut("Ctrl+/");

export default function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [tabs, setTabs] = useState<DocTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => loadJSON("expanded", {}));
  const [themeId, setThemeId] = useState<string>(() => loadString("theme", DEFAULT_THEME_ID));
  const [breaks, setBreaks] = useState<boolean>(() => loadJSON("breaks", true));
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadJSON<ViewMode>("viewMode", "split"));
  const [tocOpen, setTocOpen] = useState<boolean>(() => loadJSON("tocOpen", true));
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => loadJSON("sidebarOpen", true));
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => loadJSON("sidebarWidth", 272));
  const [splitRatio, setSplitRatio] = useState<number>(() => loadJSON("splitRatio", 0.5));
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(0);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [context, setContext] = useState<ContextState | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [recent, setRecent] = useState<string[]>(() => loadJSON<string[]>("recent", []));
  const [version, setVersion] = useState("0.1.0");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  const editorRef = useRef<EditorHandle | null>(null);
  const previewRef = useRef<PreviewHandle | null>(null);
  const panesRef = useRef<HTMLDivElement | null>(null);
  const syncLockRef = useRef(0);
  const saveTimers = useRef(new Map<string, number>());
  const tabsRef = useRef<DocTab[]>(tabs);
  const rootRef = useRef<string | null>(root);
  const activePathRef = useRef<string | null>(activePath);
  const toastSeq = useRef(0);
  tabsRef.current = tabs;
  rootRef.current = root;
  activePathRef.current = activePath;

  const activeTab = tabs.find((tab) => tab.path === activePath) ?? null;
  const content = activeTab?.content ?? "";
  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const rendered = useMemo(
    () => renderMarkdown(content, { theme, docPath: activePath ?? undefined, breaks }),
    [content, theme, activePath, breaks]
  );
  const files = useMemo(() => flattenFiles(tree).filter((entry) => entry.markdown), [tree]);
  const dirtyPaths = useMemo(
    () => new Set(tabs.filter((tab) => tab.content !== tab.savedContent).map((tab) => tab.path)),
    [tabs]
  );
  const activeDirty = activeTab ? activeTab.content !== activeTab.savedContent : false;
  const saveState = saving ? "saving" : activeDirty ? "dirty" : lastSavedAt > 0 ? "saved" : "idle";

  const showToast = useCallback((message: string, kind: ToastState["kind"] = "info") => {
    const id = toastSeq.current + 1;
    toastSeq.current = id;
    setToast({ id, message, kind });
    window.setTimeout(() => {
      setToast((current) => (current && current.id === id ? null : current));
    }, 2800);
  }, []);

  /* ------------------------------------------------------------ 持久化 */

  useEffect(() => saveJSON("expanded", expanded), [expanded]);
  useEffect(() => saveString("theme", themeId), [themeId]);
  useEffect(() => saveJSON("breaks", breaks), [breaks]);
  useEffect(() => saveJSON("viewMode", viewMode), [viewMode]);
  useEffect(() => saveJSON("tocOpen", tocOpen), [tocOpen]);
  useEffect(() => saveJSON("sidebarOpen", sidebarOpen), [sidebarOpen]);
  useEffect(() => saveJSON("sidebarWidth", sidebarWidth), [sidebarWidth]);
  useEffect(() => saveJSON("splitRatio", splitRatio), [splitRatio]);
  useEffect(() => saveJSON("recent", recent), [recent]);

  useEffect(() => {
    document.title = activeTab ? activeTab.name + " - MDMaster" : "MDMaster";
  }, [activeTab]);

  /* -------------------------------------------------------------- 文件 */

  const rememberRoot = useCallback((path: string) => {
    saveString("lastRoot", path);
    setRecent((current) => [path, ...current.filter((item) => item !== path)].slice(0, 8));
  }, []);

  const openPath = useCallback(
    async (path: string) => {
      try {
        const payload = await bridge.workspace.load(path);
        setRoot(payload.root);
        setTree(payload.tree);
        setTabs([]);
        setActivePath(null);
        setExpanded(topLevelDirState(payload.tree));
        rememberRoot(payload.root);
        const first = flattenFiles(payload.tree).find((entry) => entry.markdown);
        if (first) {
          const file = await bridge.fs.read(first.path);
          setTabs([{ path: file.path, name: first.name, content: file.content, savedContent: file.content }]);
          setActivePath(file.path);
        }
        return true;
      } catch (error) {
        showToast("打开文件夹失败：" + String((error as Error)?.message ?? error), "error");
        return false;
      }
    },
    [rememberRoot, showToast]
  );

  const openFolder = useCallback(async () => {
    const payload = await bridge.workspace.open();
    if (!payload) return;
    setRoot(payload.root);
    setTree(payload.tree);
    setTabs([]);
    setActivePath(null);
    setExpanded(topLevelDirState(payload.tree));
    rememberRoot(payload.root);
    const first = flattenFiles(payload.tree).find((entry) => entry.markdown);
    if (first) {
      try {
        const file = await bridge.fs.read(first.path);
        setTabs([{ path: file.path, name: first.name, content: file.content, savedContent: file.content }]);
        setActivePath(file.path);
      } catch {
        /* 忽略 */
      }
    }
  }, [rememberRoot]);

  const refreshTree = useCallback(async () => {
    if (!rootRef.current) return;
    try {
      const payload = await bridge.workspace.refresh();
      if (payload) setTree(payload.tree);
    } catch {
      /* 忽略刷新失败 */
    }
  }, []);

  const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i;

  const openFile = useCallback(
    async (path: string, name?: string) => {
      if (IMAGE_FILE_RE.test(path)) {
        void bridge.fs.reveal(path);
        return;
      }
      const existing = tabsRef.current.find((tab) => tab.path === path);
      if (existing) {
        setActivePath(path);
        return;
      }
      try {
        const file = await bridge.fs.read(path);
        const label = name ?? path.split(/[\\/]/).pop() ?? path;
        setTabs((current) => [
          ...current,
          { path: file.path, name: label, content: file.content, savedContent: file.content },
        ]);
        setActivePath(file.path);
      } catch (error) {
        showToast("打开文件失败：" + String((error as Error)?.message ?? error), "error");
      }
    },
    [showToast]
  );

  const saveNow = useCallback(
    async (path: string) => {
      const tab = tabsRef.current.find((item) => item.path === path);
      if (!tab || tab.content === tab.savedContent) return;
      setSaving(true);
      try {
        await bridge.fs.write(path, tab.content);
        setTabs((current) => current.map((item) => (item.path === path ? { ...item, savedContent: tab.content } : item)));
        setLastSavedAt(Date.now());
      } catch (error) {
        showToast("保存失败：" + String((error as Error)?.message ?? error), "error");
      } finally {
        setSaving(false);
      }
    },
    [showToast]
  );

  const queueSave = useCallback(
    (path: string) => {
      const timers = saveTimers.current;
      const existing = timers.get(path);
      if (existing) window.clearTimeout(existing);
      timers.set(
        path,
        window.setTimeout(() => {
          timers.delete(path);
          void saveNow(path);
        }, AUTOSAVE_DELAY)
      );
    },
    [saveNow]
  );

  const updateContent = useCallback(
    (value: string) => {
      const path = activePath;
      if (!path) return;
      setTabs((current) => current.map((item) => (item.path === path ? { ...item, content: value } : item)));
      queueSave(path);
    },
    [activePath, queueSave]
  );

  const flushAll = useCallback(async () => {
    const timers = saveTimers.current;
    for (const timer of timers.values()) window.clearTimeout(timer);
    timers.clear();
    const pending = tabsRef.current.filter((tab) => tab.content !== tab.savedContent);
    for (const tab of pending) await saveNow(tab.path);
    showToast(pending.length > 0 ? "已保存 " + pending.length + " 个文档" : "没有需要保存的修改", "success");
  }, [saveNow, showToast]);

  const saveActive = useCallback(async () => {
    const path = activePath;
    if (!path) return;
    const timer = saveTimers.current.get(path);
    if (timer) {
      window.clearTimeout(timer);
      saveTimers.current.delete(path);
    }
    await saveNow(path);
    showToast("已保存", "success");
  }, [activePath, saveNow, showToast]);

  const closeTab = useCallback(
    async (path: string) => {
      await saveNow(path);
      const current = tabsRef.current;
      const index = current.findIndex((tab) => tab.path === path);
      const next = current.filter((tab) => tab.path !== path);
      setTabs(next);
      if (activePathRef.current === path) {
        const fallback = next[Math.max(0, Math.min(index, next.length - 1))];
        setActivePath(fallback ? fallback.path : null);
      }
    },
    [saveNow]
  );

  const remapPath = useCallback((oldPath: string, newPath: string) => {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.path === oldPath) {
          return { ...tab, path: newPath, name: newPath.split(/[\\/]/).pop() ?? tab.name };
        }
        if (tab.path.startsWith(oldPath + "/") || tab.path.startsWith(oldPath + String.fromCharCode(92))) {
          const nextPath = newPath + tab.path.slice(oldPath.length);
          return { ...tab, path: nextPath, name: nextPath.split(/[\\/]/).pop() ?? tab.name };
        }
        return tab;
      })
    );
    setActivePath((current) => {
      if (!current) return current;
      if (current === oldPath) return newPath;
      if (current.startsWith(oldPath + "/") || current.startsWith(oldPath + String.fromCharCode(92))) {
        return newPath + current.slice(oldPath.length);
      }
      return current;
    });
  }, []);

  const createEntry = useCallback(
    async (dir: string, name: string, kind: "file" | "dir") => {
      try {
        const created = await bridge.fs.create(dir || rootRef.current || "", name, kind);
        await refreshTree();
        if (kind === "file") await openFile(created.path, created.name);
        showToast(kind === "file" ? "已新建文档" : "已新建文件夹", "success");
      } catch (error) {
        showToast("新建失败：" + String((error as Error)?.message ?? error), "error");
      }
    },
    [openFile, refreshTree, showToast]
  );

  const renameEntry = useCallback(
    async (node: TreeNode, name: string) => {
      try {
        const result = await bridge.fs.rename(node.path, name);
        remapPath(node.path, result.path);
        await refreshTree();
        showToast("已重命名", "success");
      } catch (error) {
        showToast("重命名失败：" + String((error as Error)?.message ?? error), "error");
      }
    },
    [refreshTree, remapPath, showToast]
  );

  const deleteEntry = useCallback(
    async (node: TreeNode) => {
      try {
        await bridge.fs.remove(node.path);
        const prefixA = node.path + "/";
        const prefixB = node.path + String.fromCharCode(92);
        const next = tabsRef.current.filter(
          (tab) => tab.path !== node.path && !tab.path.startsWith(prefixA) && !tab.path.startsWith(prefixB)
        );
        setTabs(next);
        if (!next.some((tab) => tab.path === activePathRef.current)) {
          setActivePath(next[0]?.path ?? null);
        }
        await refreshTree();
        showToast("已移到回收站", "success");
      } catch (error) {
        showToast("删除失败：" + String((error as Error)?.message ?? error), "error");
      }
    },
    [refreshTree, showToast]
  );

  const moveEntry = useCallback(
    async (sourcePath: string, targetDir: string) => {
      if (sourcePath === targetDir) return;
      try {
        const result = await bridge.fs.move(sourcePath, targetDir);
        if (result.path !== sourcePath) remapPath(sourcePath, result.path);
        await refreshTree();
        showToast("已移动", "success");
      } catch (error) {
        showToast("移动失败：" + String((error as Error)?.message ?? error), "error");
      }
    },
    [refreshTree, remapPath, showToast]
  );

  /* --------------------------------------------------------- 公众号/导出 */

  const handleCopy = useCallback(async () => {
    if (!activeTab) return;
    setCopying(true);
    try {
      const current = await bridge.settings.get();
      let html = rendered.copyHtml;
      let note = "";
      if (current.uploadProvider !== "none") {
        const srcs = collectLocalImageSrcs(rendered.html);
        if (srcs.length > 0) {
          const result = await bridge.images.upload(srcs);
          html = toCopyHtml(rendered.html, result.map);
          const uploaded = Object.keys(result.map).length;
          if (result.errors.length > 0) {
            note = "（" + result.errors.length + " 张图片上传失败，需手动处理：" + result.errors[0] + "）";
          } else if (uploaded > 0) {
            note = "，已上传 " + uploaded + " 张图片";
          }
        }
      }
      const channel = await copyRichHtml(html, htmlToPlainText(html));
      if (channel === "text") {
        showToast("浏览器仅允许复制纯文本，请使用桌面版", "error");
      } else {
        showToast("已复制到公众号格式" + note + "，去微信编辑器 Ctrl+V 粘贴吧", note.indexOf("失败") >= 0 ? "info" : "success");
      }
    } catch (error) {
      showToast("复制失败：" + String((error as Error)?.message ?? error), "error");
    } finally {
      setCopying(false);
    }
  }, [activeTab, rendered, showToast]);

  const handlePasteImages = useCallback(
    async (files: File[]) => {
      const docPath = activePathRef.current;
      if (!docPath) {
        showToast("请先打开一个文档，再粘贴图片", "error");
        return;
      }
      for (const file of files) {
        try {
          const buffer = await file.arrayBuffer();
          const saved = await bridge.images.save({
            buffer,
            type: file.type,
            name: file.name,
            docPath,
          });
          editorRef.current?.insertMarkdown("![](" + saved.rel + ")");
          showToast("图片已存到 " + saved.rel, "success");
          void refreshTree();
        } catch (error) {
          showToast("保存图片失败：" + String((error as Error)?.message ?? error), "error");
        }
      }
    },
    [refreshTree, showToast]
  );

  const handleExport = useCallback(async () => {
    if (!activeTab) return;
    const title = activeTab.name.replace(/\.[^.]+$/, "");
    const html = buildStandaloneHtml(title, rendered.copyHtml);
    const saved = await bridge.exportHtml(title + ".html", html);
    if (saved) showToast("已导出：" + saved, "success");
  }, [activeTab, rendered.copyHtml, showToast]);

  /* -------------------------------------------------------------- 联动 */

  const handleEditorScroll = useCallback(() => {
    const now = performance.now();
    if (now < syncLockRef.current) return;
    const position = editorRef.current?.getScrollPosition();
    if (!position) return;
    syncLockRef.current = now + SYNC_LOCK_MS;
    previewRef.current?.jumpToPosition(Math.max(0, position.line - 1), position.ratio);
  }, []);

  const handlePreviewScroll = useCallback((state: PreviewScrollState) => {
    setActiveHeadingId(state.headingId);
    const now = performance.now();
    if (now < syncLockRef.current) return;
    syncLockRef.current = now + SYNC_LOCK_MS;
    editorRef.current?.scrollToPosition(state.line + 1, state.ratio);
  }, []);

  const jumpToLine = useCallback((line: number) => {
    syncLockRef.current = performance.now() + SYNC_LOCK_MS + 80;
    previewRef.current?.jumpToPosition(line, 0);
    editorRef.current?.scrollToPosition(line + 1, 0);
  }, []);

  const handlePreviewClickLine = useCallback((line: number) => {
    editorRef.current?.setCursorLine(line + 1);
  }, []);

  const handleOpenLink = useCallback((url: string) => {
    void bridge.shell.openExternal(url);
  }, []);

  /* --------------------------------------------------------- 布局拖拽 */

  const startSidebarResize = (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const onMove = (moveEvent: MouseEvent) => {
      setSidebarWidth(Math.min(460, Math.max(190, startWidth + moveEvent.clientX - startX)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("is-resizing");
    };
    document.body.classList.add("is-resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startSplitResize = (event: React.MouseEvent) => {
    event.preventDefault();
    const rect = panesRef.current?.getBoundingClientRect();
    if (!rect) return;
    const onMove = (moveEvent: MouseEvent) => {
      const ratio = (moveEvent.clientX - rect.left) / rect.width;
      setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("is-resizing");
    };
    document.body.classList.add("is-resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  /* ------------------------------------------------------------- 菜单 */

  const openContext = (event: React.MouseEvent, node: TreeNode) => {
    event.preventDefault();
    event.stopPropagation();
    setContext({ x: event.clientX, y: event.clientY, node });
  };

  const contextItems = (node: TreeNode): MenuItem[] => {
    const dir = node.type === "dir" ? node.path : node.path.slice(0, Math.max(node.path.lastIndexOf("/"), node.path.lastIndexOf(String.fromCharCode(92))));
    return [
      { label: "新建文档", onClick: () => setPrompt({ kind: "newFile", dir }) },
      { label: "新建文件夹", onClick: () => setPrompt({ kind: "newFolder", dir }) },
      { label: "", divider: true },
      { label: "重命名", onClick: () => setPrompt({ kind: "rename", node }) },
      { label: "复制路径", onClick: () => void bridge.clipboard.writeText(node.path) },
      { label: "在文件夹中显示", onClick: () => void bridge.fs.reveal(node.path), disabled: !isDesktop },
      { label: "", divider: true },
      {
        label: "删除（移到回收站）",
        danger: true,
        onClick: () =>
          setConfirm({
            message: "确定把「" + node.name + "」移到回收站吗？",
            onConfirm: () => void deleteEntry(node),
          }),
      },
    ];
  };

  /* ----------------------------------------------------------- 快捷键 */

  const actions = useRef({
    saveActive,
    flushAll,
    openFolder,
    closeTab,
    handleCopy,
    handleExport,
    openPath,
    openFile,
    activePath,
    root,
  });
  actions.current = { saveActive, flushAll, openFolder, closeTab, handleCopy, handleExport, openPath, openFile, activePath, root };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const current = actions.current;

      if (matches(event, SAVE_SPEC)) {
        event.preventDefault();
        void current.saveActive();
        return;
      }
      if (matches(event, SAVE_ALL_SPEC)) {
        event.preventDefault();
        void current.flushAll();
        return;
      }
      if (matches(event, NEW_SPEC)) {
        event.preventDefault();
        if (current.root) setPrompt({ kind: "newFile", dir: current.root });
        return;
      }
      if (matches(event, OPEN_SPEC)) {
        event.preventDefault();
        void current.openFolder();
        return;
      }
      if (matches(event, PALETTE_SPEC)) {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (matches(event, CLOSE_SPEC)) {
        event.preventDefault();
        if (current.activePath) void current.closeTab(current.activePath);
        return;
      }
      if (matches(event, COPY_SPEC)) {
        event.preventDefault();
        void current.handleCopy();
        return;
      }
      if (matches(event, EXPORT_SPEC)) {
        event.preventDefault();
        void current.handleExport();
        return;
      }
      if (matches(event, VIEW_SPEC)) {
        event.preventDefault();
        setViewMode((mode) => (mode === "split" ? "editor" : mode === "editor" ? "preview" : "split"));
        return;
      }
      if (matches(event, TOC_SPEC)) {
        event.preventDefault();
        setTocOpen((open) => !open);
        return;
      }
      if (matches(event, SIDEBAR_SPEC)) {
        event.preventDefault();
        setSidebarOpen((open) => !open);
        return;
      }
      if (matches(event, HELP_SPEC)) {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      for (const item of COMMAND_BY_SHORTCUT) {
        if (matches(event, item.spec)) {
          event.preventDefault();
          if (current.activePath) editorRef.current?.run(item.id);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* -------------------------------------------------------------- 启动 */

  useEffect(() => {
    let alive = true;
    void (async () => {
      const info = await bridge.info();
      if (!alive) return;
      setVersion(info.version);
      try {
        setSettings(await bridge.settings.get());
      } catch {
        /* 忽略 */
      }
      if (info.smokeRoot) {
        await openPath(info.smokeRoot);
        if (info.smokeFile) await openFile(info.smokeFile);
        return;
      }
      const last = loadString("lastRoot", "");
      if (last) await openPath(last);
    })();
    return () => {
      alive = false;
    };
  }, [openPath, openFile]);

  useEffect(() => {
    if (!isDesktop) return;
    let timer = 0;
    const dispose = bridge.onWorkspaceChanged(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refreshTree(), 400);
    });
    return () => {
      window.clearTimeout(timer);
      dispose();
    };
  }, [refreshTree]);

  useEffect(() => {
    if (!bridge.onFlushRequest) return;
    const dispose = bridge.onFlushRequest(async () => {
      const pending = tabsRef.current.filter((tab) => tab.content !== tab.savedContent);
      for (const tab of pending) {
        try {
          await bridge.fs.write(tab.path, tab.content);
        } catch {
          /* 忽略，尽量保存 */
        }
      }
      bridge.flushDone?.();
    });
    return dispose;
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      for (const tab of tabsRef.current) {
        if (tab.content !== tab.savedContent) void bridge.fs.write(tab.path, tab.content);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const runEditorCommand = (id: CommandId) => {
    editorRef.current?.run(id);
    editorRef.current?.focus();
  };

  const hasFile = Boolean(activeTab);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">MD</div>
          <div className="brand-text">
            <span className="brand-name">MDMaster</span>
            <span className="brand-tag">Markdown · 公众号排版</span>
          </div>
        </div>

        <div className="topbar-nav">
          <button
            className={"ghost-button tiny" + (sidebarOpen ? " is-active" : "")}
            onClick={() => setSidebarOpen((open) => !open)}
            title="显示/隐藏文件栏 (Ctrl+Alt+B)"
          >
            ▤ 文件栏
          </button>
          <button className="ghost-button tiny" onClick={() => void openFolder()} title="打开文件夹作为工程目录 (Ctrl+O)">
            📂 打开文件夹
          </button>
        </div>

        <div className="topbar-center">
          {activeTab ? (
            <span className="doc-title" title={activeTab.path}>
              {activeTab.name}
              {activeDirty ? <span className="doc-dirty">未保存</span> : null}
            </span>
          ) : (
            <span className="doc-title is-muted">{root ? "未选择文档" : "未打开工作区"}</span>
          )}
        </div>

        <div className="topbar-actions">
          <button className="icon-button" onClick={() => setSettingsOpen(true)} title="设置：图片目录与公众号上传">
            ⚙
          </button>
          <button className="ghost-button" onClick={() => setHelpOpen(true)} title="快捷键面板 (Ctrl+/)">
            快捷键
          </button>
          <button className="ghost-button" onClick={() => void handleExport()} disabled={!hasFile} title="导出 HTML (Ctrl+Shift+E)">
            导出 HTML
          </button>
          <button
            className="primary-button"
            onClick={() => void handleCopy()}
            disabled={!hasFile || copying}
            title="复制到公众号 (Ctrl+Shift+C)"
          >
            {copying ? "上传图片中…" : "复制到公众号"}
          </button>
        </div>
      </header>

      <div className="app-body">
        {sidebarOpen ? (
          <>
            <div className="sidebar-wrap" style={{ width: sidebarWidth }}>
              <Sidebar
                root={root}
                tree={tree}
                activePath={activePath}
                expanded={expanded}
                dirtyPaths={dirtyPaths}
                onOpenFolder={() => void openFolder()}
                onToggleDir={(path) => setExpanded((current) => ({ ...current, [path]: !current[path] }))}
                onOpenFile={(node) => void openFile(node.path, node.name)}
                onNewFile={(dir) => setPrompt({ kind: "newFile", dir })}
                onNewFolder={(dir) => setPrompt({ kind: "newFolder", dir })}
                onRefresh={() => void refreshTree()}
                onContextMenu={openContext}
                onMove={(source, target) => void moveEntry(source, target)}
                onReveal={(path) => void bridge.fs.reveal(path)}
                onCollapse={() => setSidebarOpen(false)}
              />
            </div>
            <div className="resizer resizer-v" onMouseDown={startSidebarResize} />
          </>
        ) : null}

        <main className="main">
          {root === null ? (
            <Welcome recent={recent} version={version} onOpenFolder={() => void openFolder()} onOpenRecent={(path) => void openPath(path)} />
          ) : (
            <>
              <Tabs
                tabs={tabs}
                activePath={activePath}
                onSelect={(path) => setActivePath(path)}
                onClose={(path) => void closeTab(path)}
                onNew={() => setPrompt({ kind: "newFile", dir: root })}
              />
              <Toolbar
                disabled={!hasFile}
                viewMode={viewMode}
                themeId={themeId}
                tocOpen={tocOpen}
                onCommand={runEditorCommand}
                onViewMode={setViewMode}
                onTheme={setThemeId}
                onToggleToc={() => setTocOpen((open) => !open)}
              />

              {hasFile ? (
                <div className="panes" ref={panesRef}>
                  {viewMode !== "preview" ? (
                    <div
                      className="pane editor-pane"
                      style={viewMode === "split" ? { width: splitRatio * 100 + "%" } : { flex: "1 1 auto" }}
                    >
                      <Editor
                        ref={editorRef}
                        value={content}
                        docKey={activeTab ? activeTab.path : ""}
                        onChange={updateContent}
                        onCursor={setCursor}
                        onScroll={handleEditorScroll}
                        onPasteImages={(files) => void handlePasteImages(files)}
                      />
                    </div>
                  ) : null}

                  {viewMode === "split" ? <div className="resizer resizer-h" onMouseDown={startSplitResize} /> : null}

                  {viewMode !== "editor" ? (
                    <div className="pane preview-pane">
                      <Preview
                        ref={previewRef}
                        html={rendered.html}
                        docPath={activePath ?? ""}
                        onScroll={handlePreviewScroll}
                        onJumpToLine={handlePreviewClickLine}
                        onOpenLink={handleOpenLink}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">▤</div>
                  <h2>{tabs.length === 0 ? "开始一篇新的文档" : "从标签栏选择文档"}</h2>
                  <p>在左侧文件树中双击文件，或按 Ctrl+N 新建文档</p>
                  <button className="primary-button" onClick={() => setPrompt({ kind: "newFile", dir: root ?? "" })}>
                    新建文档
                  </button>
                </div>
              )}

              <StatusBar
                root={root}
                activePath={activePath}
                stats={rendered.stats}
                cursor={cursor}
                saveState={saveState}
                desktop={isDesktop}
                breaks={breaks}
                onBreaks={setBreaks}
              />
            </>
          )}
        </main>

        {tocOpen && hasFile && viewMode !== "editor" ? (
          <Toc items={rendered.toc} activeId={activeHeadingId} onJump={jumpToLine} onClose={() => setTocOpen(false)} />
        ) : null}
      </div>

      {context ? (
        <ContextMenu x={context.x} y={context.y} items={contextItems(context.node)} onClose={() => setContext(null)} />
      ) : null}

      {prompt ? (
        <PromptDialog
          title={prompt.kind === "newFile" ? "新建文档" : prompt.kind === "newFolder" ? "新建文件夹" : "重命名"}
          label={prompt.kind === "rename" ? "新名称" : "名称"}
          defaultValue={
            prompt.kind === "newFile"
              ? "未命名.md"
              : prompt.kind === "newFolder"
                ? "新建文件夹"
                : prompt.node.name
          }
          placeholder={prompt.kind === "newFile" ? "例如 我的文章.md" : "输入名称"}
          confirmText={prompt.kind === "rename" ? "重命名" : "创建"}
          onCancel={() => setPrompt(null)}
          onConfirm={(value) => {
            const current = prompt;
            setPrompt(null);
            if (current.kind === "rename") void renameEntry(current.node, value);
            else void createEntry(current.dir, value, current.kind === "newFile" ? "file" : "dir");
          }}
        />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title="确认删除"
          message={confirm.message}
          confirmText="删除"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.onConfirm();
            setConfirm(null);
          }}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={async (patch) => {
            const next = await bridge.settings.set(patch);
            setSettings(next);
            showToast("设置已保存", "success");
          }}
          onTest={async (patch) => {
            const next = await bridge.settings.set(patch);
            setSettings(next);
            return bridge.images.testUpload();
          }}
        />
      ) : null}

      {helpOpen ? <ShortcutDialog onClose={() => setHelpOpen(false)} /> : null}

      {paletteOpen ? (
        <CommandPalette
          files={files}
          onSelect={(path) => {
            setPaletteOpen(false);
            void openFile(path);
          }}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}

      {toast ? <Toast message={toast.message} kind={toast.kind} /> : null}
    </div>
  );
}
