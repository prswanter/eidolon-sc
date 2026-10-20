"use client";

import type { ComponentProps } from "react";

import { AppLink } from "@/components/app/AppLink";
import { useDirectory } from "@/components/conversations/ConversationDirectory";

/**
 * 导航外壳里的站内链接（AppLink）：按外壳的去处规则（lib/navShell），通话中去外壳外面（后台、`/about`…）
 * 先弹「会挂断和{name}的通话」，确认了挂断再去；在外壳里换页照常。只能用在导航外壳里。
 */
export function ShellLink({ href, ...props }: Omit<ComponentProps<typeof AppLink>, "href" | "onClick"> & { href: string }) {
  const { guard } = useDirectory();
  return <AppLink href={href} onClick={guard(href)} {...props} />;
}
