# MDMaster

专注中文写作的 Markdown 编辑器：左边写、右边看，滚动双向联动，图片本地存储，渲染结果一键粘贴到微信公众号。

> 当前状态：功能开发与自动化测试阶段，**暂未打包 exe**（打包配置见文末）。

## 功能

- **左右分屏**：Markdown 源码 + 实时预览，中间分隔条可拖动，支持 编辑 / 分屏 / 预览 三种视图
- **滚动联动**：双向同步（编辑区 ↔ 预览区），点击预览任意段落可把光标定位回源码
- **目录（TOC）**：标题自动生成右侧目录，滚动时高亮当前章节，点击跳转，可一键收起
- **文件管理**：顶栏或侧栏「打开文件夹」选择工程目录；文件树支持新建文档 / 新建文件夹 / 重命名 / 删除（移入回收站）/ 拖拽移动 / 搜索过滤 / 右键菜单，外部改动自动刷新
- **多标签 + 自动保存**：同时编辑多个文档；输入 700ms 后自动落盘，关窗时等待最后一次保存
- **快捷键**：标题、加粗、斜体、删除线、行内代码、代码块、引用、列表、任务、表格、图片、分隔线、链接
- **图片与图注**：单独成段的图片渲染为「图片 + 居中图注」（优先用 title，没有 title 时用描述），图注同样以行内样式输出，复制到公众号一样保留；句子中间的图片不加图注
- **预览增强**：页内 `#锚点` 可跳转并同步编辑器光标；图片加载失败显示占位提示；图片、字体撑开布局后自动重算滚动锚点，联动不跑偏
- **图片本地图床**：截图直接 `Ctrl+V` 粘贴或拖入编辑区，图片自动保存到工作区的图片目录，并插入相对路径 Markdown
- **复制到公众号**：渲染结果全部转成**行内样式**（含代码高亮）；复制时自动把本地图片上传成公网地址（公众号官方接口或自定义图床），再写入剪贴板，粘进微信编辑器即可
- **四套公众号主题**：简约黑白 / 微信绿 / 科技蓝 / 暖阳橙
- **导出**：一键导出独立 HTML 文件

## 快速开始

```bash
npm install          # 依赖安装（.npmrc 已配置 electron 国内镜像）
npm run dev          # 开发模式：Vite + Electron，热更新
npm run build        # 类型检查 + 生产构建（输出 dist/）
npm start            # 用生产构建启动桌面应用
```

写作推荐用 `npm start`；改代码用 `npm run dev`。

## 图片与公众号上传

### 1. 粘贴 / 拖入图片

在编辑区 `Ctrl+V` 粘贴截图，或把图片文件拖进编辑区，程序会：

1. 把图片写到工作区根目录下的图片目录（默认 `assets`，可在设置中改）
2. 按文档所在目录计算相对路径，插入 `![图片](assets/img-20260101120000-ab12.png)`

纯本地存储，不依赖任何外部服务，图片随工程一起走。

### 2. 复制到公众号时自动上传

点「复制到公众号」时，程序会把文档里引用的本地图片逐张上传，把 HTML 里的图片地址换成公网地址，再写入剪贴板。两种上传方式（设置 ⚙ → 上传方式）：

| 方式 | 说明 |
| --- | --- |
| 公众号官方接口 | 用 AppID / AppSecret 换 access_token，调用 `media/uploadimg`，返回 `mmbiz.qpic.cn` 地址，只在你的公众号内可见，最稳妥 |
| 自定义图床 | POST `multipart/form-data` 到你的接口，从返回 JSON 里按路径（默认 `data.url`）取图片地址 |
| 不上传 | 保留本地相对路径，粘贴后需在微信编辑器里手动重传图片 |

**公众号官方接口的前置条件**（缺一不可）：

1. 公众号后台「设置与开发 → 基本配置」拿到 **AppID / AppSecret**，并把本机**公网 IP** 加入 **IP 白名单**（否则获取 access_token 会被拒绝）
2. 该公众号有对应的接口权限
3. 图片小于 **1MB**、格式为 jpg / png（微信 uploadimg 的限制）

> 为什么不做「本地 HTTP 图床」：微信在保存文章时是**服务端**去抓取图片地址的，`127.0.0.1` 这类本地地址它抓不到，粘进去也只是当场看着能用。

上传结果按「文件路径 + 修改时间 + 大小」缓存，同一张图不会重复上传；换图后自动重新上传。凭据保存在本机用户目录（明文），请勿在共享电脑上配置。

## 测试

```bash
npm test             # 纯逻辑单测：渲染、内联样式、目录、文本变换、图片地址映射
npm run smoke        # Electron 端到端：界面交互检查 + 截图（.smoke/shot.png）
```

`npm run smoke` 会复制 `demo/` 到 `.smoke/workspace` 并用独立的 `.smoke/userdata` 启动应用（不会碰你的真实设置），逐项验证：双向滚动联动、快捷键插入、目录跳转、自动保存、顶栏文件栏开关、设置弹窗与持久化、粘贴图片落盘、右键菜单、拖拽移动、重命名、新建文档、主题切换、工具栏不溢出、本地图片加载，以及：

- 「复制到公众号」写入系统剪贴板的 HTML 是否合规（含内联样式、无 class、无联动属性）
- 复制时是否把本地图片换成了公网地址（测试内会起一个假图床接口做真实 HTTP 回环）

## 快捷键

| 功能 | 快捷键 | 功能 | 快捷键 |
| --- | --- | --- | --- |
| 加粗 | Ctrl+B | 一级标题 | Ctrl+1 |
| 斜体 | Ctrl+I | 二级标题 | Ctrl+2 |
| 删除线 | Ctrl+Shift+X | 三级标题 | Ctrl+3 |
| 行内代码 | Ctrl+E | 正文（清标题） | Ctrl+0 |
| 超链接 | Ctrl+K | 引用 | Ctrl+Shift+Q |
| 代码块 | Ctrl+Shift+K | 无序列表 | Ctrl+Shift+U |
| 表格 | Ctrl+Shift+M | 有序列表 | Ctrl+Shift+O |
| 图片 | Ctrl+Shift+I | 任务列表 | Ctrl+Shift+T |
| 分隔线 | Ctrl+Shift+H | 打开文件夹 | Ctrl+O |
| 保存 | Ctrl+S | 新建文档 | Ctrl+N |
| 全部保存 | Ctrl+Shift+S | 快速跳转文件 | Ctrl+P |
| 关闭标签 | Ctrl+W | 复制到公众号 | Ctrl+Shift+C |
| 导出 HTML | Ctrl+Shift+E | 切换视图 | Ctrl+Shift+V |
| 目录开关 | Ctrl+Alt+O | 文件栏开关 | Ctrl+Alt+B |
| 查找 | Ctrl+F | 快捷键面板 | Ctrl+/ |

## 目录结构

```
electron/
  main.cjs           主进程：窗口、文件系统 IPC、设置、mdlocal 图片协议、图片保存与上传、冒烟测试
  preload.cjs        contextBridge 暴露的 window.mdmaster API
src/
  App.tsx            应用状态编排：文件、标签、自动保存、滚动联动、快捷键、复制流程
  components/        Editor(CodeMirror6) / Preview / Toc / Sidebar / FileTree / Tabs / Toolbar / 各类弹窗
  lib/
    markdown.ts      markdown-it 渲染 + 行内样式化 + 目录提取 + 复制版 HTML 生成 + 字数统计
    theme.ts         四套公众号主题（全部内联样式）
    transforms.ts    纯函数文本变换（加粗、标题、列表、代码块…），可单测
    commands.ts      命令与快捷键注册表
    scrollSync.ts    滚动位置 ↔ 源码行的映射
    bridge.ts        桌面 API 与浏览器内存降级
scripts/
  dev.mjs / start.mjs / smoke.mjs / clip-preview.cjs
tests/run.ts         单测入口
demo/                演示工作区
```

## 公众号粘贴说明

- 复制时会把 `<section style="...">` 整篇文章写入剪贴板（`text/html` + 纯文本兜底），并去掉仅供联动的 `data-line` 等属性
- 代码高亮由 `highlight.js` 生成后转换为 span 内联颜色，微信里同样有配色
- **限制**：微信正文不支持外链跳转，链接文字会保留但无法点击

## 打包发布（Windows 安装包）

```bash
npm run dist        # 构建 + 生成安装包：release/MDMaster-Setup-1.0.0.exe
npm run dist:dir    # 只生成免安装目录：release/win-unpacked/
```

- 安装包为 NSIS 安装程序，**按当前用户安装**（默认 `%LOCALAPPDATA%\Programs\MDMaster`，安装时可自定义目录，不需要管理员权限）
- 会自动创建桌面快捷方式和开始菜单项，自带卸载程序 `Uninstall MDMaster.exe`
- 应用数据（设置、图片上传缓存）在 `%APPDATA%\MDMaster`，卸载时默认保留
- exe 的属性里已写入公司信息：**CompanyName = 北京云林智炬信息科技有限公司**、**LegalCopyright = Copyright © 2026 北京云林智炬信息科技有限公司**

> 国内网络若下载 Electron/NSIS 资源失败，先设置镜像再打包（`.npmrc` 已配好，也可用环境变量）：
> ```powershell
> $env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
> $env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
> ```

### 分发到其他电脑

安装包是自包含的（自带 Electron 运行时），目标机器**不需要安装 Node.js**，双击即装。

⚠️ **当前安装包未做代码签名**，首次运行 Windows SmartScreen 会提示「Windows 已保护你的电脑 / 未知发布者」，点「更多信息 → 仍要运行」即可。若要去掉该提示，需要购买代码签名证书，然后在 `build.win` 中配置 `signtoolOptions`（`certificateFile` / `certificatePassword`）后重新打包。

## 已知限制

- 浏览器直开（`npm run dev:web`）时使用内存文件系统，图片保存/上传不可用，仅用于看界面
- 预览区不做 XSS 过滤（本地可信文档场景），如需分享渲染结果请自行过滤