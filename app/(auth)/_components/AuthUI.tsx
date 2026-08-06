"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";

/* ---------- Google icon ---------- */
export function GoogleIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.4 29.4 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.5 6.3 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.5 6.3 29 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 43.5c5 0 9.4-1.7 12.9-4.6l-6-5c-1.9 1.3-4.3 2.1-6.9 2.1-5.4 0-9.9-3.1-11.5-7.5l-6.5 5c3.3 5.8 9.9 10 18 10z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2.1 3.8-3.9 5l6 5c-.4.4 6.6-4.8 6.6-14 0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}

/* ---------- Input ---------- */
type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  icon?: ReactNode;
};

export function TextField({ label, hint, icon, id, className = "", ...rest }: InputProps) {
  const inputId = id || rest.name || label;
  return (
    <label htmlFor={inputId} className="block">
      <span className="text-sm font-medium text-brand-900/85">{label}</span>
      <div className="mt-1.5 relative">
        {icon && (
          <div className="absolute inset-y-0 left-3 flex items-center text-brand-700/60 pointer-events-none">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          {...rest}
          className={`w-full rounded-xl border border-border bg-white ${
            icon ? "pl-10" : "pl-4"
          } pr-4 py-3 text-brand-900 placeholder:text-brand-900/35 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition ${className}`}
        />
      </div>
      {hint && <div className="mt-1 text-xs text-brand-900/55">{hint}</div>}
    </label>
  );
}

/* ---------- Password field with show/hide ---------- */
export function PasswordField(props: Omit<InputProps, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextField {...props} type={show ? "text" : "password"} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-[38px] text-xs font-medium text-brand-700 hover:text-brand-900"
        aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
      >
        {show ? "ซ่อน" : "แสดง"}
      </button>
    </div>
  );
}

/* ---------- Icons ---------- */
export const AuthI = {
  Mail: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
    </svg>
  ),
  Lock: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  User: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  Phone: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" />
    </svg>
  ),
};

/* ---------- Divider "หรือ" ---------- */
export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-brand-900/45">
      <div className="flex-1 h-px bg-border" />
      หรือ
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
