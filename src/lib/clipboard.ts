import { bridge } from "./bridge";

export type CopyChannel = "desktop" | "clipboard-api" | "exec-command" | "text";

async function copyViaExecCommand(html: string): Promise<boolean> {
  const holder = document.createElement("div");
  holder.contentEditable = "true";
  holder.style.position = "fixed";
  holder.style.left = "-9999px";
  holder.style.top = "0";
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  selection?.removeAllRanges();
  holder.remove();
  return ok;
}

/** 复制富文本（微信可识别的 HTML 剪贴板） */
export async function copyRichHtml(html: string, text: string): Promise<CopyChannel> {
  if (bridge.isDesktop) {
    await bridge.clipboard.writeHtml(html, text);
    return "desktop";
  }
  try {
    if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return "clipboard-api";
    }
  } catch {
    /* 继续降级 */
  }
  if (await copyViaExecCommand(html)) return "exec-command";
  await bridge.clipboard.writeText(text);
  return "text";
}

export function htmlToPlainText(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.innerText;
}
