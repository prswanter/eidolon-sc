"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { focusBack, type CallScreen, type FocusSpot } from "@/lib/callFocus";

/**
 * 通话层收起、或者通话条消失时，焦点在里面就把它送回页上（focusBack）：通话还在进行时落在通话条上，
 * 结束了落在页首的电话键上；焦点在别处时不动。在 layout effect 里做：通话层这一刻已经 aria-hidden、inert，
 * 浏览器还没来得及把焦点清掉，焦点就已经不在里面了。
 * 电话键禁用时也拿得到焦点（Button 用 focusableWhenDisabled）。
 * 领域里的名字（callFocus 的 "note"、noteShown）沿用上一版的便利贴，指的就是现在的通话条。
 */
export function useFocusBack({ layerOpen, noteShown }: CallScreen) {
  const layer = useRef<HTMLElement>(null);
  const note = useRef<HTMLButtonElement>(null);
  const phoneKey = useRef<HTMLButtonElement>(null);
  // 焦点最后在哪：焦点随元素被藏起、被拿掉而掉到 body 时，靠它知道原来在哪。
  // 点到页上不能聚焦的地方焦点也会掉到 body，这时按点的位置算，免得记着的位置过期。
  const last = useRef<FocusSpot>("elsewhere");

  useEffect(() => {
    const remember = (e: Event) => (last.current = spotOf(e.target, layer.current, note.current));
    document.addEventListener("focusin", remember);
    document.addEventListener("pointerdown", remember);
    return () => {
      document.removeEventListener("focusin", remember);
      document.removeEventListener("pointerdown", remember);
    };
  }, []);

  useLayoutEffect(() => {
    const active = document.activeElement;
    const was = active && active !== document.body ? spotOf(active, layer.current, note.current) : last.current;
    const target = focusBack(was, { layerOpen, noteShown });
    // 通话条整条就是一个按钮。
    if (target === "note") note.current?.focus();
    if (target === "phoneKey") phoneKey.current?.focus();
  }, [layerOpen, noteShown]);

  return { layer, note, phoneKey };
}

function spotOf(target: EventTarget | null, layer: HTMLElement | null, note: HTMLElement | null): FocusSpot {
  if (!(target instanceof Node)) return "elsewhere";
  if (layer?.contains(target)) return "layer";
  if (note?.contains(target)) return "note";
  return "elsewhere";
}
