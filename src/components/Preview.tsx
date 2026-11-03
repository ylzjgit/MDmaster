import { useEffect, useImperativeHandle, useRef } from "react";
import type { Ref } from "react";
import { activeHeadingId, collectAnchors, lineAtScroll, lineFromElement, offsetForLine } from "../lib/scrollSync";
import type { Anchor } from "../lib/scrollSync";

export interface PreviewScrollState {
  line: number;
  ratio: number;
  headingId: string | null;
}

export interface PreviewHandle {
  jumpToPosition: (line: number, ratio: number) => void;
  scrollTop: () => number;
}

interface PreviewProps {
  html: string;
  onScroll: (state: PreviewScrollState) => void;
  onJumpToLine: (line: number) => void;
  onOpenLink: (url: string) => void;
  ref?: Ref<PreviewHandle>;
}

export function Preview({ html, onScroll, onJumpToLine, onOpenLink, ref }: PreviewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const cacheRef = useRef<{ html: string; anchors: Anchor[] }>({ html: "", anchors: [] });
  const callbacks = useRef({ onScroll, onJumpToLine, onOpenLink });
  callbacks.current = { onScroll, onJumpToLine, onOpenLink };

  const anchors = (): Anchor[] => {
    const el = scrollRef.current;
    if (!el) return [];
    if (cacheRef.current.html !== html || cacheRef.current.anchors.length === 0) {
      cacheRef.current = { html, anchors: collectAnchors(el) };
    }
    return cacheRef.current.anchors;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const timer = window.setTimeout(() => {
      cacheRef.current = { html, anchors: collectAnchors(el) };
    }, 120);
    return () => window.clearTimeout(timer);
  }, [html]);

  // 预览增强（只影响显示，不影响复制出的 HTML）：
  // 1) 图片加载失败给出可见占位；2) 图片/字体撑开布局后让滚动锚点失效重算
  useEffect(() => {
    const el = scrollRef.current;
    const article = el?.querySelector(".preview-article");
    if (!el || !article) return;

    const images = Array.from(article.querySelectorAll("img"));
    const onError = (event: Event) => {
      (event.currentTarget as HTMLImageElement).setAttribute("data-error", "1");
    };
    for (const img of images) {
      if (img.complete && img.naturalWidth === 0) img.setAttribute("data-error", "1");
      else img.addEventListener("error", onError);
    }

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        cacheRef.current = { html: "", anchors: [] };
      });
      observer.observe(article);
    }

    return () => {
      for (const img of images) img.removeEventListener("error", onError);
      observer?.disconnect();
    };
  }, [html]);

  const handleScroll = () => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollRef.current;
      if (!el) return;
      const { line, ratio } = lineAtScroll(anchors(), el.scrollTop);
      callbacks.current.onScroll({ line, ratio, headingId: activeHeadingId(el) });
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      jumpToPosition: (line: number, ratio: number) => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = Math.max(0, offsetForLine(anchors(), line, ratio));
      },
      scrollTop: () => scrollRef.current?.scrollTop ?? 0,
    }),
    [html]
  );

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest("a");
    if (anchor) {
      const href = anchor.getAttribute("href") ?? "";
      if (/^https?:\/\//i.test(href)) {
        event.preventDefault();
        callbacks.current.onOpenLink(href);
        return;
      }
      if (href.startsWith("#")) {
        event.preventDefault();
        const container = scrollRef.current;
        if (!container) return;
        const id = decodeURIComponent(href.slice(1));
        const target = Array.from(container.querySelectorAll<HTMLElement>("[id]")).find(
          (node) => node.id === id
        );
        if (!target) return;
        const line = Number(target.dataset.line);
        if (Number.isFinite(line)) callbacks.current.onJumpToLine(line);
        target.scrollIntoView({ block: "start" });
        cacheRef.current = { html: "", anchors: [] };
        return;
      }
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const line = lineFromElement(target, el);
    if (line !== null) callbacks.current.onJumpToLine(line);
  };

  return (
    <div className="preview-scroll" ref={scrollRef} onScroll={handleScroll} onClick={handleClick}>
      <div className="preview-paper">
        <div className="preview-article" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <div className="preview-tail" />
    </div>
  );
}
