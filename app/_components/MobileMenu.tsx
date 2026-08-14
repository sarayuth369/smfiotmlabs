"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type NavItem = { href: string; label: string };

export function MobileMenu({
  nav,
  isAuthed,
}: {
  nav: NavItem[];
  isAuthed: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Close on ESC + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="lg:hidden text-brand-800"
        aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
        aria-expanded={open}
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <button
            aria-label="ปิดเมนู"
            onClick={() => setOpen(false)}
            className="lg:hidden fixed inset-0 top-16 z-30 bg-brand-900/40 backdrop-blur-sm"
          />
          {/* Drawer */}
          <div
            className="lg:hidden fixed top-16 inset-x-0 z-40 bg-white border-b border-brand-100 shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="py-3 px-2 border-b border-brand-50 text-brand-900/85 font-medium hover:text-brand-600"
                >
                  {n.label}
                </Link>
              ))}

              <div className="mt-4 flex flex-col gap-2">
                {isAuthed ? (
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="w-full text-center rounded-full bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 text-sm font-semibold transition"
                  >
                    Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      className="w-full text-center rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 px-4 py-2.5 text-sm font-semibold transition"
                    >
                      เข้าสู่ระบบ
                    </Link>
                    <Link
                      href="/signup"
                      onClick={() => setOpen(false)}
                      className="w-full text-center rounded-full bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 text-sm font-semibold transition"
                    >
                      สมัครสมาชิก
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
