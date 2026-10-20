import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 定义列表：一项是标签（Caption：0.75rem、muted）加值（Body：0.875rem）。后台的用户资料、配置项的值用它
 * （DESIGN.md「Layout · 后台」）。`columns={2}`（默认）在 sm 以上排成两列，手机上一列。
 */
export function MetadataList({ columns = 2, children }: { columns?: 1 | 2; children: ReactNode }) {
  return <dl className={cn("grid gap-x-6 gap-y-4", columns === 2 && "sm:grid-cols-2")}>{children}</dl>;
}

export function MetadataListItem({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}
