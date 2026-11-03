interface WelcomeProps {
  recent: string[];
  version: string;
  onOpenFolder: () => void;
  onOpenRecent: (path: string) => void;
}

const FEATURES = [
  { icon: "⇄", title: "左右分屏联动", text: "编辑区与预览区滚动同步，点击预览即可定位到源码" },
  { icon: "☰", title: "智能目录", text: "标题自动生成目录，滚动高亮当前章节，一键跳转" },
  { icon: "📚", title: "文件管理", text: "管理多个 Markdown 文档与文件夹，支持新建、重命名、拖拽移动" },
  { icon: "⌨", title: "全键盘操作", text: "标题、加粗、代码、表格、图片等常用语法都有快捷键" },
  { icon: "✉", title: "一键到公众号", text: "渲染结果内联样式化，复制后直接粘贴进微信编辑器" },
];

export function Welcome({ recent, version, onOpenFolder, onOpenRecent }: WelcomeProps) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-brand">
          <div className="welcome-logo">MD</div>
          <div>
            <h1>MDMaster</h1>
            <p className="welcome-subtitle">Markdown 编辑器 · 左右分屏 · 一键复制到微信公众号</p>
          </div>
        </div>

        <div className="welcome-actions">
          <button className="primary-button large" onClick={onOpenFolder}>
            打开文件夹，开始写作
          </button>
          <span className="welcome-hint">也可以按 Ctrl+O</span>
        </div>

        {recent.length > 0 ? (
          <div className="welcome-recent">
            <h2>最近打开</h2>
            <ul>
              {recent.slice(0, 6).map((path) => (
                <li key={path}>
                  <button className="recent-item" onClick={() => onOpenRecent(path)} title={path}>
                    <span className="recent-icon">📁</span>
                    <span className="recent-path">{path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="welcome-features">
          {FEATURES.map((feature) => (
            <div className="feature" key={feature.title}>
              <span className="feature-icon">{feature.icon}</span>
              <div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="welcome-foot">
          <span>版本 {version}</span>
          <span>© 北京云林智炬信息科技有限公司</span>
          <span>快捷键面板按 Ctrl+/</span>
        </div>
      </div>
    </div>
  );
}
