"use client";

import { useState } from "react";

/** Numeric input with an "Unlimited" toggle. Submits empty value + `name__unlimited=on` when unlimited. */
export function LimitInput({
  name,
  label,
  initial,
  suffix,
  min = 0,
}: {
  name: string;
  label: string;
  initial: number | null;
  suffix?: string;
  min?: number;
}) {
  const [unlimited, setUnlimited] = useState<boolean>(initial === null);
  const [value, setValue] = useState<string>(initial === null ? "" : String(initial));

  return (
    <div>
      <label className="block text-xs font-semibold text-brand-900/70 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1.5">
          <input
            type="number"
            name={name}
            value={unlimited ? "" : value}
            onChange={(e) => setValue(e.target.value)}
            min={min}
            disabled={unlimited}
            placeholder={unlimited ? "Unlimited" : "0"}
            className={`w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 ${
              unlimited ? "bg-brand-50/60 text-brand-900/40" : "bg-white"
            }`}
          />
          {suffix && <span className="text-xs text-brand-900/60 shrink-0">{suffix}</span>}
        </div>
      </div>
      <label className="mt-1.5 flex items-center gap-1.5 text-xs text-brand-900/70">
        <input
          type="checkbox"
          name={`${name}__unlimited`}
          checked={unlimited}
          onChange={(e) => setUnlimited(e.target.checked)}
          className="rounded border-border text-brand-600 focus:ring-brand-500/30"
        />
        Unlimited
      </label>
    </div>
  );
}
