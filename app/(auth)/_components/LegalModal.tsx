"use client";

import { useEffect, useRef } from "react";
import type { LegalDoc } from "./legal-content";

type Props = {
  open: boolean;
  onClose: () => void;
  doc: LegalDoc;
};

export function LegalModal({ open, onClose, doc }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Lock body scroll while open + ESC to close
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // Reset scroll to top when opening
    if (ref.current) ref.current.scrollTop = 0;
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <button
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 bg-brand-900/60 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-brand-800">{doc.title}</h2>
            <p className="text-xs text-brand-900/55 mt-0.5">
              ปรับปรุงล่าสุด: {doc.updatedAt}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full w-9 h-9 flex items-center justify-center text-brand-800 hover:bg-brand-50 transition"
            aria-label="ปิด"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div ref={ref} className="overflow-y-auto px-6 py-5 flex-1 text-brand-900/85 text-sm leading-relaxed">
          {doc.intro && (
            <p className="mb-6 rounded-xl bg-brand-50 border border-brand-100 p-4 text-brand-900/85">
              {doc.intro}
            </p>
          )}

          <div className="space-y-6">
            {doc.sections.map((s) => (
              <section key={s.heading}>
                <h3 className="text-base font-bold text-brand-800 mb-2">{s.heading}</h3>
                <div className="space-y-2">
                  {s.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-8 text-xs text-brand-900/45 text-center">
            — จบเอกสาร —
          </p>
        </div>

        <div className="px-6 py-3 border-t border-border flex justify-end bg-white">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
