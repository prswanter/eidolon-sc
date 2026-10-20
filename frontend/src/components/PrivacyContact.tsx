"use client";

import { useEffect, useState } from "react";

import { SectionHeading } from "@/components/app/SubpageHeader";
import { copy } from "@/i18n";
import { getSignInOptions } from "@/lib/api";

const t = copy.privacy.contact;

/** 隐私政策末尾的联系方式：部署者在 `.env` 里设了（`EIDOLON_CONTACT`）才显示，取不到时也不显示。 */
export function PrivacyContact() {
  const [contact, setContact] = useState<string | null>(null);

  useEffect(() => {
    getSignInOptions().then(
      (options) => setContact(options.contact),
      () => {},
    );
  }, []);

  if (!contact) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>{t.title}</SectionHeading>
      <p className="text-body">{t.text(contact)}</p>
    </section>
  );
}
