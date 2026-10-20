// The time a call screen shows: how long the call has lasted since it connected, or, in its
// last minute before the time limit, how long it has left (spec「通话状态」).

import { copy } from "@/i18n";

export type CallTime = { kind: "elapsed" | "remaining"; seconds: number };

export function callTime(since: number, maxSeconds: number | null, now: number): CallTime {
  const elapsed = Math.max(0, Math.floor((now - since) / 1000));
  if (maxSeconds !== null && maxSeconds - elapsed < 60) {
    return { kind: "remaining", seconds: Math.max(0, maxSeconds - elapsed) };
  }
  return { kind: "elapsed", seconds: elapsed };
}

/** `mm:ss`, minutes going past 59 rather than to hours. */
export function clock(seconds: number): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(seconds / 60))}:${two(seconds % 60)}`;
}

/** The time as the call screen, its note and the list show it: `03:21`, or `还剩 00:42`. */
export function showTime(time: CallTime): string {
  const shown = clock(time.seconds);
  return time.kind === "remaining" ? copy.call.remaining(shown) : shown;
}
