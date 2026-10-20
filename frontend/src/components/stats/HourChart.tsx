"use client";

import { useEffect, useRef, useState } from "react";

import { copy } from "@/i18n";
import { columnPath } from "@/lib/chart";
import { cn } from "@/lib/utils";

const t = copy.settings.stats;

const HEIGHT = 120;
const AXIS = 20; // the row of hour labels under the columns
const TOP = 4;
const MAX_BAR = 20;
const GAP = 2;
const RADIUS = 3; // the rounded data end; the baseline end stays square
const LABELLED = [0, 6, 12, 18];

/**
 * 统计的分时段图（DESIGN.md「统计页」）：0 到 23 点 24 根柱子，这段跨度里每个钟点的回合加送礼，只用 `--foreground` 一种颜色。
 * 读数在图上方：平时是一共几次，悬停一根时是那个钟点的次数；悬停的槽位铺 `bg-muted`，其余柱子降到半透明。
 * 底下标 0、6、12、18 点。按容器实际宽度画（`ResizeObserver`），字号不随栏宽变化；同样的数在一张表里给读屏。
 */
export function HourChart({ hours }: { hours: number[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || 600));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const most = Math.max(1, ...hours);
  const base = HEIGHT - AXIS;
  const y = (n: number) => base - (n / most) * (base - TOP);
  const slot = width / hours.length;
  const bar = Math.max(1, Math.min(MAX_BAR, slot - GAP));
  const total = hours.reduce((sum, n) => sum + n, 0);
  const readout = hovered === null ? t.hoursTotal(total) : t.hourCount(hovered, hours[hovered]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm text-muted-foreground tabular-nums">{readout}</p>
      <svg
        ref={ref}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`${t.hoursLabel}，${t.hoursTotal(total)}`}
        onMouseLeave={() => setHovered(null)}
        className="block overflow-visible text-xs tabular-nums"
      >
        <line x1={0} x2={width} y1={base} y2={base} className="stroke-border" strokeWidth={1} />
        {hours.map((count, hour) => {
          const x = slot * hour + (slot - bar) / 2;
          const isHovered = hovered === hour;
          return (
            <g key={hour} onMouseEnter={() => setHovered(hour)}>
              {/* The hit target is the whole slot, taller than the column. */}
              <rect
                x={slot * hour}
                y={0}
                width={slot}
                height={base}
                className={isHovered ? "fill-muted" : "fill-transparent"}
              />
              {count > 0 && (
                <path
                  d={columnPath(x, bar, y(count), base, RADIUS)}
                  className={cn("fill-foreground transition-opacity", hovered !== null && !isHovered && "opacity-50")}
                />
              )}
              {LABELLED.includes(hour) && (
                <text x={slot * hour + slot / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-muted-foreground">
                  {t.hour(hour)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <tbody>
          {hours.map((count, hour) => (
            <tr key={hour}>
              <td>{t.hourCount(hour, count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
