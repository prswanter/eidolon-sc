"use client";

import { useCallback, useState } from "react";
import type { PanelSize } from "react-resizable-panels";

import { loadPanelSize, savePanelSize, type Panel } from "@/lib/panelSizes";

/**
 * 宽屏上可以拖动调宽窄的一栏（对话列表），记住制作人上次拖到的像素宽度。
 * 交给 shadcn Resizable 的 ResizablePanel：`defaultSize` 和 `onResize` 都要传上去。
 * 记下的宽度在用这个 hook 的组件挂上时读一次，当作这一栏的 defaultSize，挂着时不再变（defaultSize 变了，
 * 这一栏会在 Group 里重新登记）。所以要让这个组件和这一栏一起挂上、卸下，每次挂上恢复一次；并且只在水合之后渲染，
 * 服务端读不到 localStorage，水合时会对不上。
 * 不在挂上之后调 panelRef.resize：窄屏切回宽屏时这一栏是加进已有的 Group，Group 还没算好它的布局，会抛
 * 「Layout not found for Panel」。
 */
export function useSavedSize(panel: Panel, initial: number) {
  const [defaultSize] = useState(() => loadPanelSize(panel) ?? initial);

  // 挂上时的第一次回调（没有上一次的尺寸）只是报告默认宽度，不记。
  const onResize = useCallback(
    (size: PanelSize, _id: string | number | undefined, previous: PanelSize | undefined) => {
      if (previous) savePanelSize(panel, size.inPixels);
    },
    [panel],
  );

  return { defaultSize, onResize };
}
