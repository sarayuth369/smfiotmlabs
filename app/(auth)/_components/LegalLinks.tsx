"use client";

import { useState } from "react";
import { LegalModal } from "./LegalModal";
import { termsContent, privacyContent } from "./legal-content";

type Kind = "terms" | "privacy" | null;

export function LegalLinks({
  className = "",
  linkClassName = "text-brand-600 hover:text-brand-800 underline",
  separator = " และ ",
  prefix,
}: {
  className?: string;
  linkClassName?: string;
  separator?: string;
  prefix?: React.ReactNode;
}) {
  const [open, setOpen] = useState<Kind>(null);
  const doc = open === "terms" ? termsContent : open === "privacy" ? privacyContent : null;

  return (
    <>
      <span className={className}>
        {prefix}
        <button type="button" onClick={() => setOpen("terms")} className={linkClassName}>
          ข้อกำหนดการใช้งาน
        </button>
        {separator}
        <button type="button" onClick={() => setOpen("privacy")} className={linkClassName}>
          นโยบายความเป็นส่วนตัว
        </button>
      </span>

      {doc && <LegalModal open={!!doc} onClose={() => setOpen(null)} doc={doc} />}
    </>
  );
}
