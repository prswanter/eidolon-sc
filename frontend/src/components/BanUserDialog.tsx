"use client";

import { useId, useState } from "react";

import { FailureNotice } from "@/components/app/FailureNotice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { copy } from "@/i18n";
import { banUser, type AdminUserDetails } from "@/lib/adminUsers";
import { toFailure, type Failure } from "@/lib/failure";

const t = copy.admin.users.banDialog;

const NOTE_MAX = 500;

/**
 * 封禁一位用户：说明后果，可以写一句只有管理者看得到的备注，再确认。
 * `user` 为 null 时对话框关着；封禁成功后把后端返回的这位用户交给 `onBanned`。
 * 真正执行的「确认封禁」是 destructive（挂断红），取消是 ghost（DESIGN.md「Buttons」）。
 */
export function BanUserDialog({
  user,
  onClose,
  onBanned,
}: {
  user: { id: string; name: string } | null;
  onClose: () => void;
  onBanned: (user: AdminUserDetails) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const noteId = useId();

  function close() {
    if (busy) return;
    setNote("");
    setFailure(null);
    onClose();
  }

  async function confirm() {
    if (!user) return;
    setBusy(true);
    setFailure(null);
    try {
      const banned = await banUser(user.id, note);
      setNote("");
      onBanned(banned);
    } catch (e) {
      setFailure(toFailure(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title(user?.name ?? "")}</DialogTitle>
          <DialogDescription>{t.hint}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={noteId}>{t.note}</FieldLabel>
          <Textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} />
          <FieldDescription>{t.noteHint}</FieldDescription>
        </Field>
        {failure && <FailureNotice failure={failure} />}
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>
            {copy.common.cancel}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy || note.length > NOTE_MAX}>
            {busy && <Spinner data-icon="inline-start" />}
            {t.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
