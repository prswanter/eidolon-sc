"use client";

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/**
 * 水合完了没有。服务端渲染和水合时是 false，之后是 true。
 * 水合前按窗口取的值（例如 `useMediaQuery`）都还是服务端的猜测，要靠 CSS 兜住真实窗口时用它。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}
