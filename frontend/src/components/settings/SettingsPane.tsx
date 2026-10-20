import type { ReactNode } from "react";

import { PageShell } from "@/components/app/PageShell";
import { SubpageHeader } from "@/components/app/SubpageHeader";
import { copy } from "@/i18n";
import type { SettingsCategory } from "@/lib/settingsCategory";

/**
 * 设置的二级页面（DESIGN.md「设置页」）：页首是类别名，手机上左边一个返回键回到一级列表（电脑上和一级并排，不要返回键）；
 * 内容是居中、最宽 640px 的一栏。占满设置 layout 给它的右栏（手机上是整页）。
 */
export function SettingsPane({ category, end, children }: { category: SettingsCategory; end?: ReactNode; children: ReactNode }) {
  return (
    <PageShell
      header={
        <SubpageHeader title={copy.settings.categories[category]} backHref="/settings" isBackNarrowOnly end={end} />
      }
      isInShell
    >
      {children}
    </PageShell>
  );
}
