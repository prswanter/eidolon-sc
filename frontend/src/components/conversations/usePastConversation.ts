"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { listConversations, listMessages } from "@/lib/api";
import { conversationLog, emptyLog, type Entry } from "@/lib/conversationLog";
import { previewOfOne } from "@/lib/conversationList";
import { toFailure, type Failure } from "@/lib/failure";
import { pastOne } from "@/lib/pastConversations";

/** 正在看的历史对话：读着；读到了（记录转成的条目、她是不是结束了它、最后一次往来的时间）；没读到。 */
export type Viewing =
  | { id: string; status: "opening" }
  | { id: string; status: "open"; entries: Entry[]; ended: boolean; at: string }
  | { id: string; status: "failed"; failure: Failure };

/** 浏览历史里的标记：这一条是从她的当前对话（不带 `c` 的这一页）打开历史对话时 push 的，退回去就是当前对话。 */
const FROM_CURRENT = "eidolonPastFromCurrent";

/**
 * 对话页上正在看哪段历史对话（spec「打开历史对话」）：地址 `/conversation/<她>?c=<对话 id>` 里的 `c`。
 * 不经过 LiveConversation：自己按 id 读记录，用打开对话时同一套规则（`conversationLog` 的 `loaded`）转成条目。
 * `c` 不是她的、是当前对话、或者是空对话时当作没带，地址换成不带 `c` 的。
 *
 * - `view`：从当前对话打开一段时 push 一条浏览历史（带上标记），从一段历史对话换到另一段时换掉这一条。
 * - `backToCurrent`：这一条是从当前对话 push 来的就退回去，否则（直接打开的链接）换成不带 `c` 的地址。
 *
 * 地址用原生 History API 改，Next 的 `useSearchParams` 跟着变；页面不重挂，她的对话和通话都留在原处。
 * 用了 `useSearchParams`，外面要包 `Suspense`（对话页 page.tsx）。
 */
export function usePastConversation(characterId: string): {
  viewing: Viewing | null;
  view: (id: string) => void;
  backToCurrent: () => void;
} {
  const id = useSearchParams().get("c") || null;
  const [read, setRead] = useState<Viewing | null>(null);
  const current = `/conversation/${encodeURIComponent(characterId)}`;

  useEffect(() => {
    if (id === null) return;
    let gone = false;
    (async () => {
      const past = pastOne(await listConversations(characterId), id);
      if (gone) return;
      if (!past) {
        window.history.replaceState(null, "", current);
        return;
      }
      const records = await listMessages(id);
      if (gone) return;
      const { entries } = conversationLog(emptyLog, { type: "loaded", messages: records });
      setRead({ id, status: "open", entries, ended: past.ended, at: previewOfOne(past).at });
    })().catch((e: unknown) => {
      if (!gone) setRead({ id, status: "failed", failure: toFailure(e) });
    });
    return () => {
      gone = true;
    };
  }, [characterId, id, current]);

  const view = useCallback(
    (to: string) => {
      const url = `${current}?c=${encodeURIComponent(to)}`;
      if (id === null) window.history.pushState({ [FROM_CURRENT]: true }, "", url);
      else window.history.replaceState(isFromCurrent() ? { [FROM_CURRENT]: true } : null, "", url);
    },
    [current, id],
  );

  const backToCurrent = useCallback(() => {
    if (isFromCurrent()) window.history.back();
    else window.history.replaceState(null, "", current);
  }, [current]);

  const viewing: Viewing | null = id === null ? null : read?.id === id ? read : { id, status: "opening" };
  return { viewing, view, backToCurrent };
}

function isFromCurrent(): boolean {
  return (window.history.state as Record<string, unknown> | null)?.[FROM_CURRENT] === true;
}
