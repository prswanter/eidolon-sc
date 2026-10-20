"use client";

import type { ReactNode } from "react";

import { PROSE_WIDTH } from "@/components/app/SettingsSection";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// 看板各块共用的零件：一组数字卡、装一块内容的 Card、比例条，以及窄屏上代替表格的 divide-y 行。

/**
 * 一组数字卡，上面一行 Caption 写这组数字是什么时候的（「此刻」「30 天内」）。卡片排成格子：
 * 手机一行两张，中屏三张，宽屏五张；`grid` 可以换掉这套列数（例如「此刻」那组在左右排时只占一列）。
 */
export function TileGroup({
  caption,
  grid = "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  className,
  children,
}: {
  caption: string;
  grid?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-2", className)}>
      <h2 className="text-xs text-muted-foreground">{caption}</h2>
      <div className={cn("grid gap-3", grid)}>{children}</div>
    </section>
  );
}

/** 看板上的一块：一张 Card，标题、一句说明，右上角可以有一个操作（`action`），下面是图表或表格
 * （DESIGN.md「Layout · 后台 · 看板」）。 */
export function DashboardCard({
  id,
  title,
  hint,
  action,
  className,
  level = 3,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  /** 标题的层级：放在「用量」「花费」这类 h2 组里是 h3，直接挂在页面标题下面是 h2。 */
  level?: 2 | 3;
  children: ReactNode;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <Card id={id} className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle>
          <Heading>{title}</Heading>
        </CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** 看板上的一组（「用量」「花费」）：h2 和一句说明，下面是这一组的各张卡。 */
export function DashboardGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {hint && <p className={cn(PROSE_WIDTH, "text-sm text-muted-foreground")}>{hint}</p>}
      </header>
      {children}
    </section>
  );
}

/** 两张卡一排（宽屏），更窄时上下排。 */
export function CardPair({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-6 lg:grid-cols-2">{children}</div>;
}

/**
 * 表格和它窄屏上的行，按视口宽度用 CSS 切换（不靠 JS，服务端渲染出来就对）：`at="lg"`（默认，≥ 1024px）
 * 给三四列的小表；七列的宽表（服务健康、按模型的花费）用 `at="xl"`（≥ 1280px）。侧栏常驻时占去 16rem，
 * 视口到这两档内容区才放得下（DESIGN.md「表格」）。
 */
export function TableOrRows({ at = "lg", table, rows }: { at?: "lg" | "xl"; table: ReactNode; rows: ReactNode }) {
  return (
    <>
      <div className={at === "lg" ? "max-lg:hidden" : "max-xl:hidden"}>{table}</div>
      <div className={at === "lg" ? "lg:hidden" : "xl:hidden"}>{rows}</div>
    </>
  );
}

/**
 * 比例条：`part` 对 `whole` 有多长。底 `bg-muted`，条只用前景色（DESIGN.md「Admin status & charts」）。
 * 放在 `BarRows` 的行里时，悬停一行，其余各行的条降到半透明。
 */
export function ShareBar({ part, whole }: { part: number; whole: number }) {
  const width = whole > 0 ? (part / whole) * 100 : 0;
  return (
    <span aria-hidden="true" className="block h-2 w-full overflow-hidden rounded-full bg-muted">
      <span
        className="block h-full rounded-full bg-foreground transition-opacity group-hover/bars:not-group-hover/bar:opacity-50"
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/** 有比例条的表体、表行要带的 group 类：悬停的那一行的条保持实色，其余降到半透明。 */
export const BAR_BODY = "group/bars";
export const BAR_ROW = "group/bar";

export interface Row {
  id: string;
  label: ReactNode;
  /** 名字下面的副行：窄屏上放不进行尾的其余各列。 */
  description?: ReactNode;
  /** 行尾：这一行最要紧的数字或状态。 */
  end?: ReactNode;
}

/** 窄屏上代替表格的行（`divide-y`）：名字在左、数字或状态在行尾，其余各列放副行（0.75rem、muted）。 */
export function RowList({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-y text-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words">{row.label}</span>
            {row.end !== undefined && <span className="shrink-0 text-right tabular-nums">{row.end}</span>}
          </div>
          {row.description !== undefined && (
            <div className="flex flex-col gap-0.5 text-xs break-words text-muted-foreground">{row.description}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
