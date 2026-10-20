// 测试用：读 globals.css 里的主题颜色（shadcn neutral 加少数覆盖值，DESIGN.md「Colors」）。
// 颜色变量写在 :root 里，是 light-dark(浅色, 深色)、两种模式共用的一个值，或 var(--另一个变量)。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { oklchToHex, type ModePair } from "@/lib/imageColor";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

export const MODES = ["light", "dark"] as const;
export type Mode = (typeof MODES)[number];

/** 主题变量（例如 `--muted-foreground`）在某个模式下的颜色，换成 `#rrggbb`。 */
export function themeColor(name: string, mode: Mode): string {
  const declared = css.match(new RegExp(`(?<![\\w-])${name}:\\s*(.+?);`))?.[1];
  if (!declared) throw new Error(`globals.css 里没有 ${name}`);
  const alias = declared.match(/^var\((--[\w-]+)\)$/);
  if (alias) return themeColor(alias[1], mode);
  const pair = declared.match(/^light-dark\((.+?),\s*(.+)\)$/);
  return toHex((pair ? pair[mode === "light" ? 1 : 2] : declared).trim());
}

/** 主题变量在两种模式下的颜色。 */
export function themePair(name: string): ModePair {
  return { light: themeColor(name, "light"), dark: themeColor(name, "dark") };
}

function toHex(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const oklch = value.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/);
  if (!oklch) throw new Error(`不认识的颜色写法：${value}（只认 #rrggbb 和不透明的 oklch）`);
  const [l, c, h] = oklch.slice(1).map(Number);
  return oklchToHex(l, c, h);
}
