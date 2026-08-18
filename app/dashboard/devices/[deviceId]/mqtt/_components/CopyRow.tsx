"use client";

import { useState } from "react";

export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="text-xs font-semibold text-brand-900/60 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-sm bg-brand-50/60 border border-brand-100 rounded-lg px-3 py-2 break-all">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-xs rounded-lg border border-brand-200 hover:border-brand-400 hover:bg-brand-50 px-3 py-2 font-medium text-brand-800"
        >
          {copied ? "✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}
