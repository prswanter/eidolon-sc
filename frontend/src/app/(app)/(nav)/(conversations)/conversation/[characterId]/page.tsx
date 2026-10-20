"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense } from "react";

import { useDirectory, useWide } from "@/components/conversations/ConversationDirectory";
import { ConversationView } from "@/components/conversations/ConversationView";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { copy } from "@/i18n";

/** 和一位角色的对话。宽屏时在双栏外壳的右栏，窄屏时占满一页、页首带返回键。 */
export default function ConversationPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const router = useRouter();
  const wide = useWide();
  const { account, characters, failure } = useDirectory();
  const character = characters?.find((c) => c.id === characterId);
  const back = () => router.push("/conversations");

  const loading = (
    <div className="flex h-full items-center justify-center p-6">
      <Spinner className="size-6 text-muted-foreground" aria-label={copy.conversation.loading} />
    </div>
  );
  if (character && account) {
    // 换角色时整页重来：上一位的对话（和通话）就此结束。对话页读地址里的 `?c=`（看哪段历史对话），
    // 按 Next 的要求包在 Suspense 里。
    return (
      <Suspense fallback={loading}>
        <ConversationView key={character.id} userId={account.id} character={character} onBack={wide ? undefined : back} />
      </Suspense>
    );
  }
  if (characters === null && !failure) return loading;
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle>{failure ? copy.conversation.loadFailed : copy.conversation.notFound}</EmptyTitle>
        {failure && <EmptyDescription>{failure.message}</EmptyDescription>}
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={back}>
          {copy.conversation.backToList}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
