// 界面上的时间怎么写。后台的列表、详情、单价目录都用它。

export type TimestampFormat = "date_time" | "auto";

type Options = {
  /** `date_time` 给年月日加时分；`auto` 七天内说相对时间（「5小时前」），更早给日期时间。 */
  format: TimestampFormat;
  /** 「现在」是什么时候；相对时间以它为准。 */
  now: Date;
  /** IANA 时区；不传就用浏览器自己的。 */
  timeZone?: string;
};

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** `auto` 在多久以内说相对时间。 */
const RELATIVE_WITHIN = 7 * DAY;

/** 后端给的 ISO 字符串或 Date 换成 Date；认不出时是 null。 */
export function toDate(value: string | Date): Date | null {
  const at = value instanceof Date ? value : new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** 把一个时刻写成界面上的文字；认不出的字符串原样返回。 */
export function formatTimestamp(value: string | Date, { format, now, timeZone }: Options): string {
  const at = toDate(value);
  if (!at) return String(value);
  const seconds = Math.round((at.getTime() - now.getTime()) / 1000);
  if (format === "auto" && Math.abs(seconds) < RELATIVE_WITHIN) return relative(seconds);
  return dateTime(at, timeZone);
}

/** 时刻的完整写法，给 `<time>` 的悬停提示用。 */
export function fullTimestamp(at: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "full", timeStyle: "long", timeZone }).format(at);
}

function dateTime(at: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(at);
}

function relative(seconds: number): string {
  const words = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
  const size = Math.abs(seconds);
  if (size < MINUTE) return words.format(0, "second");
  if (size < HOUR) return words.format(Math.trunc(seconds / MINUTE), "minute");
  if (size < DAY) return words.format(Math.trunc(seconds / HOUR), "hour");
  return words.format(Math.trunc(seconds / DAY), "day");
}
