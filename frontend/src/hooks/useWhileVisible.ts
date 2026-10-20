"use client";

import { useEffect, useRef } from "react";

/**
 * 页面看得见时每隔 `ms` 调一次 `tick`；藏起来（切到别的标签页、锁屏）就不调，再露出来时离上次已过
 * `ms` 就马上补一次。不在看的看板不必每分钟去问后端。`ms` 变了从变的那一刻重新计时。
 */
export function useWhileVisible(tick: () => void, ms: number) {
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  });
  useEffect(() => {
    let last = Date.now();
    const run = () => {
      last = Date.now();
      tickRef.current();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= ms) run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms]);
}
