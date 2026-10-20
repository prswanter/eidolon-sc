"use client";

import { useEffect, useState } from "react";

import { FailureNotice } from "@/components/app/FailureNotice";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { copy } from "@/i18n";
import { ApiError, deleteConversation, listConversations, type Character } from "@/lib/api";
import { toFailure, type Failure } from "@/lib/failure";
import { pastDay, pastRows, type PastRow } from "@/lib/pastConversations";
import { cn } from "@/lib/utils";
import { herVars } from "@/theme/herVars";
import { EndedIcon, TrashIcon } from "@/theme/icons";

import { PreviewText } from "./PreviewText";

const t = copy.conversation.past;

/**
 * 「历史对话」面板（DESIGN.md「Overlays」）：宽屏居中的 Dialog，窄屏底部的 Drawer，都用她的颜色。
 * 和她的所有对话一行一段，最新开的在上：当前对话第一行、标「当前」，空的历史对话不列（`pastRows`）。
 * 每行第一行是对话标题，右边是最后一次往来的日期（北京时间），没有标题时只有日期；她结束了的标「她结束了」。
 * 第二行是最后一句，写法同对话列表（`PreviewText`）。
 * 正在看的那一段（没在看历史对话时是当前对话）铺中性的 bg-muted。只有当前对话时下面一句说明。
 * 每次打开都重新读一遍列表，读的时候转圈。点一行交给 `onPick`。
 * 历史对话的行右端一个删除键（同设置里记忆的删除键），先确认再删（GLOSSARY.md「历史对话」）：删掉的那行就地消失，
 * 面板不关，删的是哪段交给 `onDeleted`。当前对话不能删，那一行在同样的位置留空，日期和标记照样对齐。
 */
export function PastConversations({
  isOpen,
  onOpenChange,
  isWide,
  character,
  viewingId,
  onPick,
  onDeleted,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isWide: boolean;
  character: Character;
  /** 正在看的历史对话；看着当前对话时是 null。 */
  viewingId: string | null;
  onPick: (row: PastRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [rows, setRows] = useState<PastRow[] | "failed" | null>(null);
  const [attempt, setAttempt] = useState(0);
  // 要删的那段。确认框关上时只把 confirmingDelete 置成 false，pendingDelete 留着，关闭动画里的文字不会闪成空白。
  const [pendingDelete, setPendingDelete] = useState<PastRow | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState<ReadonlySet<string>>(new Set());
  const [failure, setFailure] = useState<Failure | null>(null);

  // 打开时重读；收起时留着，收起的动画里内容不消失。
  useEffect(() => {
    if (!isOpen) return;
    let gone = false;
    setRows(null);
    setFailure(null);
    listConversations(character.id).then(
      (listed) => !gone && setRows(pastRows(listed)),
      () => !gone && setRows("failed"),
    );
    return () => {
      gone = true;
    };
  }, [isOpen, character.id, attempt]);

  const now = new Date();
  /** 确认框和读屏里怎么称呼这段：对话标题，没有标题时是日期。 */
  const label = (row: PastRow) => row.conversation.title ?? pastDay(row.preview.at, now);

  function askToRemove(row: PastRow) {
    setPendingDelete(row);
    setConfirmingDelete(true);
  }

  async function remove(row: PastRow) {
    const id = row.conversation.id;
    const forget = () => {
      setRows((listed) => (Array.isArray(listed) ? listed.filter((r) => r.conversation.id !== id) : listed));
      onDeleted(id);
    };
    setConfirmingDelete(false);
    setDeleting((ids) => new Set(ids).add(id));
    setFailure(null);
    try {
      await deleteConversation(id);
      forget();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) forget(); // 已经删掉了
      else setFailure(toFailure(e));
    } finally {
      setDeleting((ids) => {
        const rest = new Set(ids);
        rest.delete(id);
        return rest;
      });
    }
  }

  const body =
    rows === null ? (
      <div className="flex justify-center p-6">
        <Spinner className="size-6 text-muted-foreground" aria-label={t.loading} />
      </div>
    ) : rows === "failed" ? (
      <div className="flex flex-col items-center gap-3 p-6">
        <p className="text-sm text-muted-foreground">{t.loadFailed}</p>
        <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
          {t.retry}
        </Button>
      </div>
    ) : (
      <div className="flex flex-col">
        {failure && (
          <div className="px-1 pb-2">
            <FailureNotice failure={failure} />
          </div>
        )}
        {rows.map((row) => {
          const isSelected = viewingId === null ? row.isCurrent : row.conversation.id === viewingId;
          const { title } = row.conversation;
          const day = pastDay(row.preview.at, now);
          const busy = deleting.has(row.conversation.id);
          return (
            <div
              key={row.conversation.id}
              className={cn("flex items-center gap-1 rounded-lg pr-2", isSelected ? "bg-muted" : "hover:bg-muted/60")}
            >
              <button
                type="button"
                aria-current={isSelected ? "true" : undefined}
                onClick={() => onPick(row)}
                className="flex min-h-14 min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex items-center gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", !title && "tabular-nums")}>
                    {title ?? day}
                  </span>
                  {title && <span className="shrink-0 text-meta text-muted-foreground tabular-nums">{day}</span>}
                  {row.conversation.ended && (
                    <span className="flex shrink-0 items-center gap-1 text-meta text-muted-foreground">
                      <EndedIcon aria-hidden className="size-3" />
                      {t.ended}
                    </span>
                  )}
                  {row.isCurrent && <Badge variant="secondary">{t.current}</Badge>}
                </span>
                <span className="truncate text-preview text-muted-foreground tabular-nums">
                  <PreviewText preview={row.preview} name={character.name} />
                </span>
              </button>
              {row.isCurrent ? (
                <span aria-hidden className="size-7 shrink-0" />
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.removeLabel(label(row))}
                        disabled={busy}
                        onClick={() => askToRemove(row)}
                      />
                    }
                  >
                    {busy ? <Spinner /> : <TrashIcon />}
                  </TooltipTrigger>
                  <TooltipContent>{t.remove}</TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        })}
        {rows.length === 1 && <p className="px-3 py-4 text-sm text-muted-foreground">{t.onlyCurrent}</p>}
      </div>
    );

  // 浮层渲染到对话子树外面，在内容上再注入一次她的颜色（DESIGN.md「The Scoped Colour Rule」）。
  const her = herVars(character.color);
  const confirm = (
    <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
      <AlertDialogContent style={her}>
        <AlertDialogHeader>
          <AlertDialogTitle>{pendingDelete ? t.removeTitle(label(pendingDelete)) : ""}</AlertDialogTitle>
          <AlertDialogDescription>{t.removeDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{copy.common.cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => pendingDelete && remove(pendingDelete)}>
            {t.remove}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  if (isWide) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent style={her} className="flex max-h-[80dvh] flex-col sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.description(character.name)}</DialogDescription>
          </DialogHeader>
          <div className="-mx-2 min-h-0 overflow-y-auto">{body}</div>
          {confirm}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={isOpen} onOpenChange={onOpenChange} showSwipeHandle>
      <DrawerContent style={her}>
        <DrawerHeader>
          <DrawerTitle>{t.title}</DrawerTitle>
          <DrawerDescription>{t.description(character.name)}</DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 overflow-y-auto px-2 pb-4">{body}</div>
        {confirm}
      </DrawerContent>
    </Drawer>
  );
}
