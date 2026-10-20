"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { FailureNotice } from "@/components/app/FailureNotice";
import { PageShell } from "@/components/app/PageShell";
import { SubpageHeader } from "@/components/app/SubpageHeader";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { copy } from "@/i18n";
import { getSheets, saveSheet, type Sheet } from "@/lib/api";
import { toFailure, type Failure } from "@/lib/failure";

const t = copy.editor.sheets;

/**
 * 人设卡编辑（`/sheets`，导航栏里和设置、礼物同一层）：左边选一位角色，右边整份 Markdown 都能改。
 * 存的时候后端写进 characters/sheets 下的文件、当场重新读一遍角色配置，所以下一轮对话就用新的，不用重启。
 * 没保存的改动按角色各留一份：换个人看看再换回来，改的东西还在。
 */
export function SheetEditor() {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const id = useId();

  async function load() {
    setFailure(null);
    try {
      const loaded = await getSheets();
      setSheets(loaded);
      setSelected((current) => current ?? loaded[0]?.id ?? null);
    } catch (e) {
      setFailure(toFailure(e));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const options = useMemo(
    () => (sheets ?? []).map((sheet) => ({ value: sheet.id, label: sheet.name })),
    [sheets],
  );
  const saved = sheets?.find((sheet) => sheet.id === selected) ?? null;
  const draft = selected !== null ? (drafts[selected] ?? saved?.sheet ?? "") : "";

  async function submit() {
    if (!saved) return;
    setSaving(true);
    setFailure(null);
    try {
      const updated = await saveSheet(saved.id, draft);
      setSheets((list) => list?.map((sheet) => (sheet.id === updated.id ? updated : sheet)) ?? list);
      // 后端存的时候会去掉首尾空白、补一个换行：以它回的那份为准，改动提示才会消掉。
      setDrafts((current) => {
        const next = { ...current };
        delete next[saved.id];
        return next;
      });
    } catch (e) {
      setFailure(toFailure(e));
    } finally {
      setSaving(false);
    }
  }

  if (sheets === null) {
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

  const dirty = saved !== null && draft !== saved.sheet;

  return (
    <PageShell header={<SubpageHeader title={t.title} />} isInShell>
      <div className="flex flex-col gap-4 pb-6">
        <p className="text-body text-muted-foreground">{t.note}</p>

        {sheets.length === 0 ? (
          <p className="text-body text-muted-foreground">{t.empty}</p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-wrap items-end gap-3">
              <Field className="min-w-48 flex-1">
                <FieldLabel htmlFor={`${id}-character`}>{t.pick}</FieldLabel>
                <Select
                  items={options}
                  value={selected ?? undefined}
                  onValueChange={(value) => setSelected(value as string)}
                >
                  <SelectTrigger id={`${id}-character`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex flex-wrap items-center gap-3 pb-1.5">
                <Button type="submit" disabled={!dirty || saving}>
                  {saving && <Spinner data-icon="inline-start" />}
                  {t.save}
                </Button>
                <p role="status" className="text-subtitle text-muted-foreground">
                  {dirty ? t.unsaved : t.saved}
                </p>
              </div>
            </div>

            {failure && <FailureNotice failure={failure} />}

            <Field>
              <FieldLabel htmlFor={`${id}-sheet`} className="w-full items-baseline justify-between gap-3">
                <span>{saved?.name ?? t.notFound}</span>
                <span aria-hidden="true" className="shrink-0 text-sm font-normal tabular-nums text-muted-foreground">
                  {t.chars(draft.length)}
                </span>
              </FieldLabel>
              <Textarea
                id={`${id}-sheet`}
                value={draft}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [selected as string]: event.target.value }))
                }
                rows={22}
                spellCheck={false}
                autoComplete="off"
                className="min-h-[26rem] resize-y font-mono text-[13px] leading-6"
              />
              <FieldDescription>{saved?.id}</FieldDescription>
            </Field>
          </form>
        )}
      </div>
    </PageShell>
  );
}
