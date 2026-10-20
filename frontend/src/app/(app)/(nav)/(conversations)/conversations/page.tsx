"use client";

import { copy } from "@/i18n";

/** 对话列表（`/conversations`，已登录的用户打开 `/` 也到这里）。宽屏时右栏还没选角色，居中一句 muted 标题；窄屏时外壳只显示列表，这一页不出现。 */
export default function ConversationsHome() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <h2 className="text-center text-header text-muted-foreground">{copy.conversationList.noneSelected}</h2>
    </div>
  );
}
