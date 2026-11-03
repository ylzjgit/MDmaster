export interface TreeNode {
  name: string;
  path: string;
  type: "dir" | "file";
  children?: TreeNode[];
  size?: number;
  markdown?: boolean;
  image?: boolean;
}

export interface DocTab {
  path: string;
  name: string;
  content: string;
  savedContent: string;
}

export interface WorkspacePayload {
  root: string;
  tree: TreeNode[];
}

export type ViewMode = "split" | "editor" | "preview";

export interface AppInfo {
  version: string;
  platform: string;
  smokeRoot?: string;
  smokeFile?: string;
  root?: string;
}

export interface AppSettings {
  imageDir: string;
  uploadProvider: "wechat" | "custom" | "none";
  wechatAppId: string;
  wechatAppSecret: string;
  customUploadUrl: string;
  customFieldName: string;
  customUrlPath: string;
}

export interface SavedImage {
  path: string;
  rel: string;
  name: string;
  size: number;
}

export interface UploadResult {
  map: Record<string, string>;
  errors: string[];
  uploaded?: number;
}

export interface FileEntry {
  path: string;
  name: string;
  dir: string;
  markdown: boolean;
}
