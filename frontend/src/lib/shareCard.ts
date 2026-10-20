// The share card (GLOSSARY.md「分享图」): what goes on the picture the user downloads from
// their stats, for the range they chose. Its star is the one talked with most in the range;
// it carries the form of address they set (「制作人」 if none), the portrait, the totals, the
// three talked with most and the range, and never affinity or anything of how they sign in.

import { copy } from "@/i18n";
import { callTime, mostTalked, portrait, statsSections, type Ranked, type Stats } from "@/lib/stats";

/** The picture's size, in px. */
export const SHARE_WIDTH = 1080;
export const SHARE_HEIGHT = 1350;
/** The width inside the card's padding, 64 each side. */
export const SHARE_INNER_WIDTH = SHARE_WIDTH - 128;

/** How many of those talked with most the card lists. */
export const SHARE_TOP = 3;

/** A total as the card writes it: a label over a number, or two for the hours and minutes, each with its unit. */
export type ShareTotal = { label: string; parts: { value: number; unit?: string }[] };

/** The px sizes the totals' numbers may be set in, largest first: 120 only with three of them
 * (gifts off), 100 with four, smaller when a long one would not fit its column. */
export const TOTAL_SIZES = [120, 100, 80, 64, 48] as const;

export type TotalSize = (typeof TOTAL_SIZES)[number];

/** The site as the card shows it, without the scheme, and the landing page the QR code points to. */
export type SiteAddress = { shown: string; landing: string };

export type ShareCardContent = {
  /** The star: the character talked with most in the range (the first in the idols' order of those tied). */
  hero: string;
  /** The form of address the user set, or 「制作人」. */
  address: string;
  /** The range's label: 「近 30 天」「近一年」「全部」. */
  span: string;
  portrait: string | null;
  /** Turns, calls, how long they lasted, and gifts given unless affinity and gifts are off; 0s written as 0. */
  totals: ShareTotal[];
  /** What the totals' numbers are set in, all alike. */
  totalSize: TotalSize;
  /** The three talked with most in the range, fewer if fewer took a turn. */
  top: Ranked[];
};

/** Whether there is a card to share: a turn at least in the range, so that it has a star. */
export function canShare(stats: Stats): boolean {
  return mostTalked(stats.range.characters).length > 0;
}

/** The card for the range the stats are over, with the user's form of address; null with no turn in the range. */
export function shareCard(stats: Stats, formOfAddress: string | null): ShareCardContent | null {
  const t = copy.settings.stats;
  const ranked = mostTalked(stats.range.characters);
  if (ranked.length === 0) return null;
  const { calls, gifts } = stats.range;
  const { hours, minutes } = callTime(calls.seconds);
  const totals: ShareTotal[] = [
    { label: t.turns, parts: [{ value: stats.range.turns }] },
    { label: t.calls, parts: [{ value: calls.count, unit: t.timesUnit }] },
    {
      label: t.callTime,
      parts: [...(hours > 0 ? [{ value: hours, unit: t.hoursUnit }] : []), { value: minutes, unit: t.minutesUnit }],
    },
  ];
  if (statsSections(stats).giftsGiven && gifts) totals.push({ label: t.giftsGiven, parts: [{ value: gifts.given }] });
  return {
    hero: ranked[0].character_id,
    address: formOfAddress?.trim() || t.share.producer,
    span: t.ranges[stats.range.span],
    portrait: portrait(stats.all_hours),
    totals,
    totalSize: totalSize(totals),
    top: ranked.slice(0, SHARE_TOP),
  };
}

const TOTALS_GAP = 32; // between the columns
const DIGIT_EM = 0.58; // a digit at 900, tabular, after the -0.04em tracking, with a little to spare
const PART_GAP = 10; // between the hours and the minutes
const UNIT_GAP = 6; // between a number and its unit

/** The px size of a total's unit beside a number of `size`. */
export function unitSize(size: TotalSize): number {
  return size === 120 ? 28 : 24;
}

/** The largest size every total fits its column in, the columns equal across the content's width. */
function totalSize(totals: ShareTotal[]): TotalSize {
  const column = (SHARE_INNER_WIDTH - TOTALS_GAP * (totals.length - 1)) / totals.length;
  const most = totals.length < 4 ? 120 : 100;
  const width = (total: ShareTotal, size: TotalSize) =>
    total.parts.reduce(
      (sum, part) =>
        sum +
        String(part.value).length * DIGIT_EM * size +
        (part.unit ? UNIT_GAP + part.unit.length * unitSize(size) : 0),
      PART_GAP * (total.parts.length - 1),
    );
  const sizes = TOTAL_SIZES.filter((size) => size <= most);
  return sizes.find((size) => totals.every((total) => width(total, size) <= column)) ?? sizes[sizes.length - 1];
}

/** The downloaded file's name, with the day it was made on, here: `eidolon-stats-2026-10-16.png`. */
export function shareFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `eidolon-stats-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.png`;
}

/** The site's address from the page's origin, so that no domain is written in. */
export function siteAddress(origin: string): SiteAddress {
  return { shown: origin.replace(/^https?:\/\//, ""), landing: `${origin}/` };
}
