"use client";

import { AppLink } from "@/components/app/AppLink";
import { copy } from "@/i18n";

/**
 * 页脚的声明：非官方粉丝作品、角色由 AI 扮演，以及隐私政策和使用条款（PRODUCT.md「Brand Commitments」）。
 * 一行 Meta 字号的 muted 小字（DESIGN.md「Conversation list」的免责声明同款），窄屏时链接折到下一行。
 */
export function LegalFooter() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-meta text-muted-foreground">{copy.legal.disclaimer}</p>
      <div className="flex gap-3">
        <AppLink href="/privacy" isStandalone isMuted>
          {copy.legal.privacy}
        </AppLink>
        <AppLink href="/terms" isStandalone isMuted>
          {copy.legal.terms}
        </AppLink>
      </div>
    </div>
  );
}
