import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { shortcutRows } from "../lib/shortcuts";
import { bridge } from "../lib/bridge";
import type { AppSettings } from "../types";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ title, children, onClose, footer, wide }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className={"modal" + (wide ? " is-wide" : "")} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

interface PromptDialogProps {
  title: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

export function PromptDialog({ title, label, defaultValue, placeholder, confirmText, onCancel, onConfirm }: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = input.value.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
  }, []);

  const submit = () => {
    if (!value.trim()) return;
    onConfirm(value.trim());
  };

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="ghost-button" onClick={onCancel}>
            取消
          </button>
          <button className="primary-button" onClick={submit}>
            {confirmText ?? "确定"}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{label}</span>
        <input
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
      </label>
    </Modal>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({ title, message, confirmText, danger, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="ghost-button" onClick={onCancel}>
            取消
          </button>
          <button className={danger ? "danger-button" : "primary-button"} onClick={onConfirm}>
            {confirmText ?? "确定"}
          </button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
    </Modal>
  );
}

export interface SettingsDialogProps {
  settings: AppSettings;
  onClose: () => void;
  onSave: (patch: Partial<AppSettings>) => Promise<void>;
  onTest: (patch: Partial<AppSettings>) => Promise<{ ok: boolean; url?: string; error?: string }>;
}

export function SettingsDialog({ settings, onClose, onSave, onTest }: SettingsDialogProps) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [ipInfo, setIpInfo] = useState<{ ip: string; distinct: string[]; stable: boolean } | null>(null);
  const [ipBusy, setIpBusy] = useState(false);

  const checkIp = async () => {
    setIpBusy(true);
    try {
      const info = await bridge.net.publicIp();
      setIpInfo({ ip: info.ip, distinct: info.distinct, stable: info.stable });
    } catch {
      setIpInfo(null);
    } finally {
      setIpBusy(false);
    }
  };

  const update = (patch: Partial<AppSettings>) => setForm((current) => ({ ...current, ...patch }));

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      const outcome = await onTest(form);
      setResult(
        outcome.ok
          ? { ok: true, message: "上传成功：" + (outcome.url ?? "") }
          : { ok: false, message: outcome.error ?? "上传失败" }
      );
    } catch (error) {
      setResult({ ok: false, message: String((error as Error)?.message ?? error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="设置"
      onClose={onClose}
      footer={
        <>
          <button className="ghost-button" onClick={handleTest} disabled={busy || form.uploadProvider === "none"}>
            测试上传
          </button>
          <button className="ghost-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" onClick={handleSave} disabled={busy}>
            保存
          </button>
        </>
      }
    >
      <div className="settings-section">
        <h3>图片存储</h3>
        <label className="field">
          <span>图片目录（相对工作区根目录）</span>
          <input
            value={form.imageDir}
            spellCheck={false}
            placeholder="assets"
            onChange={(event) => update({ imageDir: event.target.value })}
          />
        </label>
        <p className="settings-hint">
          在编辑区 <kbd>Ctrl+V</kbd> 粘贴截图或拖入图片文件，会自动保存到该目录，并在文档中插入相对路径。
        </p>
      </div>

      <div className="settings-section">
        <h3>复制到公众号时自动上传图片</h3>
        <label className="field">
          <span>上传方式</span>
          <select
            value={form.uploadProvider}
            onChange={(event) => update({ uploadProvider: event.target.value as AppSettings["uploadProvider"] })}
          >
            <option value="wechat">公众号官方接口（media/uploadimg）</option>
            <option value="custom">自定义图床接口（HTTP 上传）</option>
            <option value="github">GitHub 图床 + jsDelivr（免公众号白名单）</option>
            <option value="none">不上传，保留本地路径</option>
          </select>
        </label>

        {form.uploadProvider === "wechat" ? (
          <>
            <label className="field">
              <span>公众号 AppID</span>
              <input
                value={form.wechatAppId}
                spellCheck={false}
                placeholder="wx0000000000000000"
                onChange={(event) => update({ wechatAppId: event.target.value })}
              />
            </label>
            <label className="field">
              <span>公众号 AppSecret</span>
              <input
                type="password"
                value={form.wechatAppSecret}
                spellCheck={false}
                placeholder="开发者密码"
                onChange={(event) => update({ wechatAppSecret: event.target.value })}
              />
            </label>
            <p className="settings-hint">
              在公众号后台「设置与开发 → 基本配置」获取 AppID / AppSecret，并把本机公网 IP 加入 IP 白名单，否则取
              access_token 会被拒绝。上传后的图片地址属于公众号素材，仅在该公众号内可见。
            </p>
            <div className="settings-iprow">
              <button className="ghost-button" onClick={() => void checkIp()} disabled={ipBusy}>
                {ipBusy ? "检测中…" : "检测出口 IP"}
              </button>
              {ipInfo ? (
                ipInfo.stable ? (
                  <span className="settings-ip">
                    本机出口 IP：<b>{ipInfo.ip || "检测失败"}</b>，把它加入白名单即可
                  </span>
                ) : (
                  <span className="settings-ip is-warn">
                    出口 IP 在变化（{ipInfo.distinct.join(" / ")}），说明走运营商 NAT 池，白名单无法稳定命中 ——
                    建议改用 GitHub 图床或自定义图床
                  </span>
                )
              ) : (
                <span className="settings-ip">不知道要加哪个 IP 时，先点左边的检测</span>
              )}
            </div>
          </>
        ) : null}

        {form.uploadProvider === "custom" ? (
          <>
            <label className="field">
              <span>上传地址（POST multipart/form-data）</span>
              <input
                value={form.customUploadUrl}
                spellCheck={false}
                placeholder="https://your-image-host/upload"
                onChange={(event) => update({ customUploadUrl: event.target.value })}
              />
            </label>
            <label className="field">
              <span>文件字段名</span>
              <input
                value={form.customFieldName}
                spellCheck={false}
                placeholder="file"
                onChange={(event) => update({ customFieldName: event.target.value })}
              />
            </label>
            <label className="field">
              <span>返回 JSON 中的图片地址路径</span>
              <input
                value={form.customUrlPath}
                spellCheck={false}
                placeholder="data.url"
                onChange={(event) => update({ customUrlPath: event.target.value })}
              />
            </label>
            <p className="settings-hint">支持任意图床网关，只要返回 JSON 且图片地址是公网可访问的 HTTP(S) 链接。</p>
          </>
        ) : null}

        {form.uploadProvider === "github" ? (
          <>
            <div className="settings-grid2">
              <label className="field">
                <span>仓库 owner</span>
                <input
                  value={form.githubOwner}
                  spellCheck={false}
                  placeholder="ylzjgit"
                  onChange={(event) => update({ githubOwner: event.target.value })}
                />
              </label>
              <label className="field">
                <span>仓库名</span>
                <input
                  value={form.githubRepo}
                  spellCheck={false}
                  placeholder="MDmaster-images"
                  onChange={(event) => update({ githubRepo: event.target.value })}
                />
              </label>
            </div>
            <div className="settings-grid2">
              <label className="field">
                <span>分支</span>
                <input
                  value={form.githubBranch}
                  spellCheck={false}
                  placeholder="main"
                  onChange={(event) => update({ githubBranch: event.target.value })}
                />
              </label>
              <label className="field">
                <span>图片目录（仓库内）</span>
                <input
                  value={form.githubPath}
                  spellCheck={false}
                  placeholder="mdimages"
                  onChange={(event) => update({ githubPath: event.target.value })}
                />
              </label>
            </div>
            <label className="field">
              <span>GitHub Token（需要该仓库 Contents 写权限）</span>
              <input
                type="password"
                value={form.githubToken}
                spellCheck={false}
                placeholder="github_pat_..."
                onChange={(event) => update({ githubToken: event.target.value })}
              />
            </label>
            <p className="settings-hint">
              图片会提交到指定仓库，再用 jsDelivr 镜像输出公网地址（上传后自动挑选 fastly / gcore / cdn
              中能通的域名）。这条路不需要公众号白名单，适合公网 IP 会变的宽带。建议单独建一个公开仓库专门放图。
            </p>
          </>
        ) : null}

        {result ? (
          <p className={"settings-result" + (result.ok ? " is-ok" : " is-error")}>{result.message}</p>
        ) : null}
      </div>

      <p className="settings-note">
        凭据仅保存在本机用户目录（明文存放），请勿在共享电脑上配置。© 北京云林智炬信息科技有限公司
      </p>
    </Modal>
  );
}

export function ShortcutDialog({ onClose }: { onClose: () => void }) {
  const rows = shortcutRows();
  const groups = Array.from(new Set(rows.map((row) => row.group)));

  return (
    <Modal title="快捷键" wide onClose={onClose}>
      <div className="shortcut-groups">
        {groups.map((group) => (
          <div className="shortcut-group" key={group}>
            <h3>{group}</h3>
            <ul>
              {rows
                .filter((row) => row.group === group)
                .map((row) => (
                  <li key={row.keys + row.label}>
                    <span>{row.label}</span>
                    <kbd>{row.keys}</kbd>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
