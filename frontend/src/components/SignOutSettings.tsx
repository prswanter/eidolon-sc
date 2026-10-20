"use client";

import { useEffect, useState } from "react";

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
import { copy } from "@/i18n";
import { getAccount, logout, logoutEverywhere, type Account } from "@/lib/api";
import { toFailure, type Failure } from "@/lib/failure";

const t = copy.settings.signOut;

/**
 * 退出登录：单独一节，和绑定方式分开，不会跟绑定按钮搅在一起。
 * 退出时清掉这个浏览器里这位用户的自带密钥；退出所有设备要先确认，并说明其他设备上的自带密钥清不到。
 */
export function SignOutSettings() {
  const [account, setAccount] = useState<Account | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const { hangUp } = useDirectory();

  useEffect(() => {
    getAccount().then(setAccount, (e) => setFailure(toFailure(e)));
  }, []);

  async function signOut(everywhere: boolean) {
    setFailure(null);
    setConfirming(false);
    try {
      // 通话中退出登录不另问：退出登录自己的确认（退出所有设备）就够了，退出前先挂断（GLOSSARY.md「通话」）。
      await hangUp();
      await (everywhere ? logoutEverywhere(account?.id) : logout(account?.id));
      window.location.assign("/");
    } catch (e) {
      setFailure(toFailure(e));
    }
  }

  return (
    <SettingsSection title={t.title}>
      {failure && <FailureNotice failure={failure} />}
      <div className="flex flex-wrap gap-2">
        {/* 要知道是谁，退出时才能清掉这个浏览器里他的自带密钥 */}
        <Button variant="ghost" disabled={!account} onClick={() => signOut(false)}>
          {t.button}
        </Button>
        <Button variant="ghost" disabled={!account} onClick={() => setConfirming(true)}>
          {t.everywhere}
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.everywhereTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.everywhereHint}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => signOut(true)}>{t.everywhere}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
