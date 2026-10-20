import type { ReactNode } from "react";

import { PROSE_WIDTH } from "@/components/app/SettingsSection";
import { cn } from "@/lib/utils";

/** 内容列的最宽：看板、用户列表 1200px；配置、用户详情 960px（DESIGN.md「Layout · 后台」）。 */
const WIDTHS = { wide: "max-w-300", narrow: "max-w-240" } as const;

type Props = {
  title: ReactNode;
  intro?: ReactNode;
  /** 标题上方的一行，例如返回列表的链接。 */
  above?: ReactNode;
  /** 标题下方、说明之前的一行，例如状态 Badge。 */
  meta?: ReactNode;
  /** 页首右边：这一页的主要操作或范围切换（Tabs），放不下时折到下一行。 */
  end?: ReactNode;
  width: keyof typeof WIDTHS;
  children?: ReactNode;
};

/**
 * 后台每一页的框：一条限宽、居中的内容列，顶上是页首（标题 2xl semibold、一句说明，右边放主要操作），
 * 下面的各块（通常是 Card）之间 gap-6。放在 AdminShell 的内容区里。
 */
export function AdminPage({ title, intro, above, meta, end, width, children }: Props) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-6 p-4 md:p-6", WIDTHS[width])}>
      <header className="flex flex-col gap-3">
        {above}
        <div className="flex flex-wrap items-end gap-4">
          {/* 标题一栏至少 20rem：手机上放不下右边的操作时，操作折到下一行，不把说明挤成窄条。 */}
          <div className="flex min-w-0 grow basis-80 flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {meta}
            {intro && <p className={cn(PROSE_WIDTH, "text-sm text-muted-foreground")}>{intro}</p>}
          </div>
          {end}
        </div>
      </header>
      {children}
    </div>
  );
}
