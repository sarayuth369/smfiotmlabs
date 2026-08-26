"use client";

import { useState } from "react";

const CURATED_ICONS = [
  "🌡", "💧", "🌱", "☀", "🧪", "🧫", "⚡", "🌫", "🔌", "💡", "📶",
  "🌬", "🌧", "🍃", "🎯", "📏", "🔋", "📷", "🚰", "🌊", "🔥", "❄",
  "🐛", "🌾", "🧬", "📡", "⏱", "🔊", "🌦", "🪴",
];

export function IconPicker({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue || "📊");

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-10 h-10 rounded-lg border border-border bg-white flex items-center justify-center text-xl shrink-0">
          {value}
        </span>
        <input
          type="text"
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={4}
          className="w-24 rounded-lg border border-border bg-white px-2 py-2 text-center text-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1 max-w-xs">
        {CURATED_ICONS.map((ic) => (
          <button
            key={ic}
            type="button"
            onClick={() => setValue(ic)}
            className={`w-8 h-8 rounded-lg border text-base flex items-center justify-center transition ${
              value === ic ? "border-brand-500 bg-brand-50" : "border-border hover:border-brand-300"
            }`}
          >
            {ic}
          </button>
        ))}
      </div>
    </div>
  );
}
