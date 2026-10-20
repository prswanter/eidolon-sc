// What the hand-drawn SVG charts share (DESIGN.md「Admin status & charts」「统计页」).

/** A column from the baseline `base` up to `top`, rounded by `radius` only at its data end. */
export function columnPath(x: number, width: number, top: number, base: number, radius: number): string {
  const r = Math.min(radius, width / 2, base - top);
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r}`
    + ` Q${x + width},${top} ${x + width},${top + r} V${base} Z`;
}
