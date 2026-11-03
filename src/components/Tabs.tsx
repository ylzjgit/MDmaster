import type { DocTab } from "../types";

interface TabsProps {
  tabs: DocTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onNew: () => void;
}

export function Tabs({ tabs, activePath, onSelect, onClose, onNew }: TabsProps) {
  return (
    <div className="tabbar">
      <div className="tabbar-list">
        {tabs.map((tab) => {
          const dirty = tab.content !== tab.savedContent;
          return (
            <div
              key={tab.path}
              data-tab={tab.path}
              className={"tab" + (tab.path === activePath ? " is-active" : "")}
              onClick={() => onSelect(tab.path)}
              onAuxClick={(event) => {
                if (event.button === 1) onClose(tab.path);
              }}
              title={tab.path}
            >
              <span className="tab-dot" data-dirty={dirty ? "1" : "0"} />
              <span className="tab-name">{tab.name}</span>
              <button
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.path);
                }}
                title="关闭 (Ctrl+W)"
              >
                ✕
              </button>
            </div>
          );
        })}
        <button className="tab-add" onClick={onNew} title="新建文档 (Ctrl+N)">
          +
        </button>
      </div>
    </div>
  );
}
