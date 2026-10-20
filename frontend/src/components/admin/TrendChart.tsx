"use client";

import { useEffect, useRef, useState } from "react";

import { columnPath } from "@/lib/chart";
import { axisLabels, type Bucket, labelledStretches, stretchSpan } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

const HEIGHT = 180;
const AXIS = { left: 56, bottom: 24, top: 8, right: 24 }; // room for the latest label
const MAX_BAR = 24;
const GAP = 2; // the surface gap between touching columns
const RADIUS = 4; // the rounded data end; the baseline end stays square

/** One stretch of the range and its value. */
export type TrendValue = { start: string; value: number };

/**
 * One series over the stretches of the range (the turns, the calls, or what was spent in
 * one currency), as columns (dataviz: a single series needs no legend; the heading names
 * it). Above the chart, the range's total (`total`); hovering a column reads out its stretch
 * and value instead (`describe`, given the stretch's index). The same words are in a table
 * for screen readers.
 *
 * 颜色只有一种：柱子 `--foreground`（浅色黑、深色白），网格线 `--border`，刻度和读数 muted；悬停的槽位
 * 铺 `bg-muted`，其余柱子降到半透明（DESIGN.md「Admin status & charts」）。按容器实际宽度画，刻度字号
 * 不随栏宽变化。
 */
export function TrendChart({
  points,
  bucket,
  title,
  total,
  describe,
  empty,
  ticks: ticksFor,
  format,
}: {
  points: TrendValue[];
  bucket: Bucket;
  /** What the chart shows, for screen readers. */
  title: string;
  /** The whole range at a glance, read out while no column is hovered. */
  total: string;
  describe: (span: string, index: number) => string;
  empty: string;
  /** The value axis's ticks, from 0 to at least the largest value. */
  ticks: (max: number) => number[];
  format: (value: number) => string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(640);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width || 640));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const ticks = ticksFor(Math.max(0, ...points.map((p) => p.value)));
  const top = ticks[ticks.length - 1];
  const plotWidth = Math.max(1, width - AXIS.left - AXIS.right);
  const base = HEIGHT - AXIS.bottom;
  const y = (n: number) => base - (n / top) * (base - AXIS.top);
  const slot = plotWidth / Math.max(1, points.length);
  const bar = Math.max(1, Math.min(MAX_BAR, slot - GAP));
  const labels = axisLabels(
    points.map((p) => p.start),
    bucket,
    labelledStretches(points.length, Math.max(2, Math.floor(plotWidth / 64))),
  );
  const readout =
    hovered !== null && points[hovered]
      ? describe(stretchSpan(points[hovered].start, bucket), hovered)
      : points.some((p) => p.value > 0)
        ? total
        : empty;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm text-muted-foreground tabular-nums">{readout}</p>
      <svg
        ref={ref}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={title}
        onMouseLeave={() => setHovered(null)}
        className="block overflow-visible text-xs tabular-nums"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={AXIS.left} x2={width - AXIS.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
            <text x={AXIS.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground">
              {format(tick)}
            </text>
          </g>
        ))}
        {points.map((point, i) => {
          const x = AXIS.left + slot * i + (slot - bar) / 2;
          const isHovered = hovered === i;
          return (
            <g key={point.start} onMouseEnter={() => setHovered(i)}>
              {/* The hit target is the whole slot, taller and wider than the column. */}
              <rect
                x={AXIS.left + slot * i}
                y={AXIS.top}
                width={slot}
                height={base - AXIS.top}
                className={isHovered ? "fill-muted" : "fill-transparent"}
              />
              {point.value > 0 && (
                <path
                  d={columnPath(x, bar, y(point.value), base, RADIUS)}
                  className={cn("fill-foreground transition-opacity", hovered !== null && !isHovered && "opacity-50")}
                />
              )}
              {labels.has(i) && (
                <text x={x + bar / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground">
                  {labels.get(i)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <tbody>
          {points.map((point, i) => (
            <tr key={point.start}>
              <td>{describe(stretchSpan(point.start, bucket), i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
