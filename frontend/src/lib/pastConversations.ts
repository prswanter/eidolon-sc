// 历史对话面板列哪些对话、日期怎么写（GLOSSARY.md「当前对话」「历史对话」）。文字由界面按当前语言拼。

import { copy } from "@/i18n";
import type { ListedConversation } from "@/lib/api";
import { previewOfOne, type Preview } from "@/lib/conversationList";

/** 划天用的北京时间，和抽奖、好感度每日上限同一个时区（后端 `affinity.DAY_TIMEZONE`）。 */
const BEIJING_TIME = "Asia/Shanghai";

/** 面板里的一行：这段对话，是不是当前对话，最后一句（写法同对话列表）。 */
export type PastRow = { conversation: ListedConversation; isCurrent: boolean; preview: Preview };

/** 她的对话（`listConversations`，最新的在前）里要列出来的：第一条是当前对话，总列出；其余是历史对话，
 * 一条记录都没有的不列（GLOSSARY.md「历史对话」）。 */
export function pastRows(listed: ListedConversation[]): PastRow[] {
  return listed
    .filter((c, i) => i === 0 || c.last_message !== null)
    .map((c, i) => ({ conversation: c, isCurrent: i === 0, preview: previewOfOne(c) }));
}

/** 能当作历史对话打开的：她的对话里有它、不是当前对话、有记录；否则 undefined（地址里的 `c` 当作没带）。 */
export function pastOne(listed: ListedConversation[], id: string): ListedConversation | undefined {
  const i = listed.findIndex((c) => c.id === id);
  return i > 0 && listed[i].last_message !== null ? listed[i] : undefined;
}

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: BEIJING_TIME,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** 最后一次往来那天，按北京时间写成「10月15日」，不是今年的写「2025年10月15日」。 */
export function pastDay(at: string, now: Date): string {
  const day = dayParts(new Date(at));
  return day.year === dayParts(now).year
    ? copy.conversationList.monthDay(day.month, day.day)
    : copy.conversation.past.yearMonthDay(day.year, day.month, day.day);
}

function dayParts(at: Date): { year: string; month: string; day: string } {
  const of = (type: Intl.DateTimeFormatPartTypes) => parts.formatToParts(at).find((p) => p.type === type)?.value ?? "";
  return { year: of("year"), month: of("month"), day: of("day") };
}
