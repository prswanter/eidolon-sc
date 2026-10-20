"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { FailureNotice } from "@/components/app/FailureNotice";
import { PageShell } from "@/components/app/PageShell";
import { SubpageHeader } from "@/components/app/SubpageHeader";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { copy } from "@/i18n";
import {
  getReplyFormat,
  resetReplyFormat,
  saveReplyFormat,
  type ReplyFormat,
  type ReplyFormatBlocks,
} from "@/lib/api";
import { toFailure, type Failure } from "@/lib/failure";

const t = copy.editor.replyFormat;

/** 三段的键，顺序就是页面上从上往下的顺序。 */
const BLOCKS = ["format", "cues", "directed_cues"] as const;
type Block = (typeof BLOCKS)[number];

/**
 * 回复格式编辑（`/reply-format`，导航栏里和设置、礼物同一层）：`reply_format.py` 里写死的那三段，谁都能改。
 * 后端把它存在数据库旁边（`/data/reply_format.json`），每轮拼提示词时取用，所以保存后下一轮就生效，不用重启；
 * 「恢复默认」删掉存的那份，换回程序自带的写法。分段用的标签不能改，后端会挡下来（见 `formatHint`）。
 */
export function ReplyFormatEditor() {
  const [state, setState] = useState<ReplyFormat | null>(null);
  const [draft, setDraft] = useState<ReplyFormatBlocks | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const id = useId();

  function keep(next: ReplyFormat) {
    setState(next);
    setDraft({ format: next.format, cues: next.cues, directed_cues: next.directed_cues });
  }

  async function load() {
    setFailure(null);
    try {
      keep(await getReplyFormat());
    } catch (e) {
      setFailure(toFailure(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit() {
    if (!draft) return;
    setBusy(true);
    setFailure(null);
    try {
      keep(await saveReplyFormat(draft));
    } catch (e) {
      setFailure(toFailure(e));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setFailure(null);
    try {
      keep(await resetReplyFormat());
      setConfirming(false);
    } catch (e) {
      setFailure(toFailure(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const dirty = useMemo(
    () => state !== null && draft !== null && BLOCKS.some((block) => draft[block] !== state[block]),
    [state, draft],
  );

  if (state === null || draft === null) {
    return (
      <PageShell header={<SubpageHeader title={t.title} />} isInShell>
        <div className="flex flex-col gap-4">
          {failure ? (
            <>
              <FailureNotice failure={failure} />
              <Button variant="outline" className="self-start" onClick={() => void load()}>
                {copy.common.retry}
              </Button>
            </>
          ) : (
            <p className="text-body text-muted-foreground">{t.loading}</p>
          )}
        </div>
      </PageShell>
    );
  }

  const hints: Record<Block, string> = {
    format: t.formatHint,
    cues: t.cuesHint,
    directed_cues: t.directedHint,
  };
  const labels: Record<Block, string> = {
    format: t.format,
    cues: t.cues,
    directed_cues: t.directed,
  };
  const rows: Record<Block, number> = { format: 12, cues: 8, directed_cues: 10 };

  return (
    <PageShell header={<SubpageHeader title={t.title} />} isInShell>
      <div className="flex flex-col gap-4 pb-6">
        <p className="text-body text-muted-foreground">{t.note}</p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            {BLOCKS.map((block) => (
              <Field key={block}>
                <FieldLabel htmlFor={`${id}-${block}`} className="w-full items-baseline justify-between gap-3">
                  <span>{labels[block]}</span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-sm font-normal tabular-nums text-muted-foreground"
                  >
                    {t.chars(draft[block].length)}
                  </span>
                </FieldLabel>
                <Textarea
                  id={`${id}-${block}`}
                  value={draft[block]}
                  onChange={(event) => setDraft({ ...draft, [block]: event.target.value })}
                  rows={rows[block]}
                  spellCheck={false}
                  autoComplete="off"
                  className="min-h-40 resize-y font-mono text-[13px] leading-6"
                  aria-describedby={`${id}-${block}-hint`}
                />
                <FieldDescription id={`${id}-${block}-hint`}>{hints[block]}</FieldDescription>
              </Field>
            ))}
          </FieldGroup>

          {failure && <FailureNotice failure={failure} />}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!dirty || busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {t.save}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!state.is_overridden || busy}
              onClick={() => setConfirming(true)}
            >
              {t.reset}
            </Button>
            <p role="status" className="text-subtitle text-muted-foreground">
              {dirty ? t.unsaved : state.is_overridden ? t.overridden : t.builtIn}
            </p>
          </div>
        </form>

        <AlertDialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.resetTitle}</AlertDialogTitle>
              <AlertDialogDescription>{t.resetHint}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>{copy.common.cancel}</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={() => void reset()}>
                {t.resetConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageShell>
  );
}
