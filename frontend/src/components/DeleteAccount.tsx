"use client";

import { useState } from "react";

import { FailureNotice } from "@/components/app/FailureNotice";
import { SettingsSection } from "@/components/app/SettingsSection";
import { useDirectory } from "@/components/conversations/ConversationDirectory";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { copy } from "@/i18n";
import { deleteAccount, getAccount } from "@/lib/api";
import { toFailure, type Failure } from "@/lib/failure";

const t = copy.settings.deleteAccount;

/**
 * 删除用户的全部数据，连同这个浏览器里存的自带密钥；要再确认一次（PRODUCT.md「尊重陌生人的数据」）。
 * 打开确认框的入口用 outline，只有确认框里真正执行的那一下是挂断红（DESIGN.md「Buttons」）。
 */
export function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const { hangUp } = useDirectory();

  async function remove() {
    setBusy(true);
    setFailure(null);
    try {
      // 通话中删除不另问：删除自己的确认就够了，确认了先挂断（GLOSSARY.md「通话」）。
      await hangUp();
      await deleteAccount((await getAccount()).id);
      window.location.assign("/");
    } catch (e) {
      setFailure(toFailure(e));
      setConfirming(false);
      setBusy(false);
    }
  }

  return (
    <SettingsSection title={t.title} description={t.hint}>
      {failure && <FailureNotice failure={failure} />}
      <Button variant="outline" className="self-start" onClick={() => setConfirming(true)}>
        {t.start}
      </Button>
      <AlertDialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.confirmHint}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={remove}>
              {busy && <Spinner data-icon="inline-start" />}
              {t.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
