import type { ReactNode } from "react";

import type { GiftInfo } from "@/lib/gifts";
import { cn } from "@/lib/utils";

const SIZES = { fill: "w-full", large: "w-40", small: "size-16 shrink-0" } as const;

const RESET_CARD_SRC = "/reset-card/reset-card.webp";

/**
 * 礼物的插画方块（DESIGN.md「礼物插画不算界面图标」）：`bg-muted` 的 `rounded-2xl` 正方形，插画 `object-contain` 留白。
 * 网格和全部抽完撑满一格（`fill`），单抽 160px（`large`），送礼面板和重置卡条 64px（`small`）。重置卡不是礼物，
 * 但也放它的插画（`isResetCard`）。角上的闪光、件数作为 `children` 叠在上面。`isHoverable`：整格是按钮时，悬停底色加深。
 */
export function GiftTile({
  gift,
  isResetCard = false,
  size,
  isHoverable = false,
  children,
}: {
  gift?: GiftInfo;
  isResetCard?: boolean;
  size: keyof typeof SIZES;
  isHoverable?: boolean;
  children?: ReactNode;
}) {
  const src = gift ? `/gifts/${gift.id}.webp` : isResetCard ? RESET_CARD_SRC : null;
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex aspect-square items-center justify-center rounded-2xl bg-muted",
        SIZES[size],
        isHoverable && "transition-colors group-hover:bg-foreground/10",
      )}
    >
      {src && (
        <img
          src={src}
          alt=""
          loading={size === "fill" ? "lazy" : undefined}
          decoding="async"
          className={cn("size-full object-contain", size === "small" ? "p-1.5" : "p-2")}
        />
      )}
      {children}
    </span>
  );
}
