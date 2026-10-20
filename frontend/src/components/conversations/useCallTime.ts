"use client";

import { useEffect, useState } from "react";

import { callTime, type CallTime } from "@/lib/callTime";
import type { CallState } from "@/lib/liveConversation";

/** 通话层、便利贴和列表上的计时：接通后每秒更新一次；还没接通时为 null。 */
export function useCallTime(call: CallState | undefined): CallTime | null {
  const connected = call?.phase === "connected" ? call : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!connected) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [connected]);
  return connected && callTime(connected.since, connected.maxSeconds, now);
}
