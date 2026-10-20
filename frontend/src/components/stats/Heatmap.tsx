"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { copy } from "@/i18n";
import { heatmapMonths, heatmapWeeks, type Stats } from "@/lib/stats";
import { cn } from "@/lib/utils";

const t = copy.settings.stats;

const MAX_CELL = 14;
const GAP = 2;
const MONTH_ROW = 18; // the height of the row of month labels above the squares
const MONTH_LABEL_WIDTH = 30; // room for 「10月」 at text-xs

/** Each shade, 0 (did not come) to 4, all of the one color. */
const SHADES = ["fill-foreground/8", "fill-foreground/25", "fill-foreground/45", "fill-foreground/70", "fill-foreground"];

/**
 * 统计的热力图（DESIGN.md「统计页」）：过去 52 周加本周已过的几天，一周一列、周一在上，一天一格，按当天的回合加送礼深浅分五级，
 * 只用 `--foreground` 一种颜色。上面一行月份，读数在图上方：平时是来过几天，悬停一格时是那天的次数。
 * 格子按容器实际宽度算（`ResizeObserver`），最大 14px，字号不随栏宽变化。
 */
export function Heatmap({ heatmap }: { heatmap: Stats["heatmap"] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || 600));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const weeks = useMemo(() => heatmapWeeks(heatmap), [heatmap]);
  const cameOn = heatmap.counts.filter((n) => n > 0).length;
  const cell = Math.max(2, Math.min(MAX_CELL, (width - GAP * (weeks.length - 1)) / weeks.length));
  const step = cell + GAP;
  const months = heatmapMonths(weeks, Math.ceil(MONTH_LABEL_WIDTH / step));
  const cells = weeks.flat();
  const shown = cells.find((c) => c.date === hovered);
  const readout = shown
    ? t.dayCount(shown.month, shown.day, shown.count)
    : t.cameOn(cameOn);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm text-muted-foreground tabular-nums">{readout}</p>
      <svg
        ref={ref}
        width="100%"
        height={MONTH_ROW + step * 7 - GAP}
        role="img"
        aria-label={`${t.heatmapLabel}，${t.cameOn(cameOn)}`}
        onMouseLeave={() => setHovered(null)}
        className="block text-xs"
      >
        {[...months].map(([column, label]) => (
          <text key={column} x={column * step} y={12} className="fill-muted-foreground">
            {label}
          </text>
        ))}
        {weeks.map((week, column) =>
          week.map((day, row) => (
            <rect
              key={day.date}
              x={column * step}
              y={MONTH_ROW + row * step}
              width={cell}
              height={cell}
              rx={Math.min(2, cell / 4)}
              onMouseEnter={() => setHovered(day.date)}
              className={cn(SHADES[day.level], hovered === day.date && "stroke-foreground")}
              strokeWidth={1}
            />
          )),
        )}
      </svg>
    </div>
  );
}
