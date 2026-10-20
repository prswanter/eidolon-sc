"use client";

import { FormEvent, useId, useState } from "react";

import { AppLink } from "@/components/app/AppLink";
import { FailureNotice } from "@/components/app/FailureNotice";
import { PageShell } from "@/components/app/PageShell";
import { SubpageHeader } from "@/components/app/SubpageHeader";
import { LegalFooter } from "@/components/LegalFooter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { copy } from "@/i18n";
import { interpolate } from "@/i18n/interpolate";
import { agreeToTerms, logout } from "@/lib/api";
import { toFailure, type Failure } from "@/lib/failure";

const t = copy.consent;

/** 第一次登录时问一次：同意之前，别的都用不了。 */
export default function ConsentPage() {
  const [terms, setTerms] = useState(false);
  const [age, setAge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const termsId = useId();
  const ageId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    try {
      await agreeToTerms();
      window.location.assign("/conversations");
    } catch (e) {
      setFailure(toFailure(e));
      setBusy(false);
    }
  }

  async function signOut() {
    await logout().catch(() => {});
    window.location.assign("/");
  }

  return (
    <PageShell header={<SubpageHeader title={t.title} />} footer={<LegalFooter />}>
      <form onSubmit={submit} className="flex flex-col gap-6">
        <p className="text-body">
          {interpolate(t.intro, {
            privacy: (
              <AppLink key="privacy" href="/privacy">
                {copy.legal.privacy}
              </AppLink>
            ),
            terms: (
              <AppLink key="terms" href="/terms">
                {copy.legal.terms}
              </AppLink>
            ),
          })}
        </p>
        <FieldGroup className="gap-3">
          <Field orientation="horizontal">
            <Checkbox id={termsId} checked={terms} onCheckedChange={setTerms} />
            <FieldLabel htmlFor={termsId}>{t.agreeTerms}</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id={ageId} checked={age} onCheckedChange={setAge} />
            <FieldLabel htmlFor={ageId}>{t.agreeAge}</FieldLabel>
          </Field>
        </FieldGroup>
        {failure && <FailureNotice failure={failure} />}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {/* 提交中：按钮停用、前面转圈，和上一版的 isLoading 一样。 */}
            <Button type="submit" size="lg" disabled={!terms || !age || busy} aria-busy={busy}>
              {busy && <Spinner data-icon="inline-start" aria-hidden />}
              {t.submit}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={signOut}>
              {t.signOut}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t.declineHint}</p>
        </div>
      </form>
    </PageShell>
  );
}
