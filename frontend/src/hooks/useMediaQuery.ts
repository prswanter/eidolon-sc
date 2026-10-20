"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 媒体查询现在是否成立，随窗口变化更新。服务端渲染和水合时没有窗口，取 `serverValue`：
 * 传最常见的情况（例如电脑宽度传 true），水合后再按真实窗口改。
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
