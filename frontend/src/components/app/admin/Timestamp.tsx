"use client";

import { formatTimestamp, fullTimestamp, toDate, type TimestampFormat } from "@/lib/timestamp";

type Props = {
  /** 时刻：后端给的 ISO 字符串，或 Date。 */
  value: string | Date;
  /** `date_time`（默认）：年月日加时分；`auto`：七天内说相对时间，更早给日期时间。 */
  format?: TimestampFormat;
};

/**
 * 界面上的一个时间：`<time>` 加机器可读的 dateTime，悬停看完整的日期时间。按浏览器的时区写，
 * 服务端渲染时的时区和「现在」可能和浏览器不同，所以不让 React 报水合不一致。字号、颜色随外面。
 * 认不出的值原样写出来。
 */
export function Timestamp({ value, format = "date_time" }: Props) {
  const at = toDate(value);
  if (!at) return <span>{String(value)}</span>;
  return (
    <time dateTime={at.toISOString()} title={fullTimestamp(at)} className="tabular-nums" suppressHydrationWarning>
      {formatTimestamp(at, { format, now: new Date() })}
    </time>
  );
}
