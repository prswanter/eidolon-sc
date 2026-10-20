import type { ReactNode } from "react";

/**
 * 她说的日语原文：标上 lang="ja"，换成 LINE Seed JP（`font-japanese`，根布局用 next/font 载入）。
 * 是一个不参与布局的语义 span（display: contents），字号由外面的元素定，
 * 例如 `<p className="text-japanese-line"><Ja>…</Ja></p>`。
 */
export function Ja({ children }: { children: ReactNode }) {
  return (
    <span lang="ja" className="contents font-japanese">
      {children}
    </span>
  );
}
