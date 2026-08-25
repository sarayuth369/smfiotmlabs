"use client";

import { useState } from "react";
import { createRelay, deleteRelay } from "../actions";

export function AddRelayButton({
  deviceId,
  usedChannels,
  disabled,
}: {
  deviceId: string;
  usedChannels: number[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const available = [1, 2, 3, 4].filter((c) => !usedChannels.includes(c));

  if (disabled) {
    return (
      <span
        className="text-xs text-brand-900/40 cursor-not-allowed"
        title="เต็มโควตาแพ็กเกจ หรือใช้ครบ 4 channel แล้ว"
      >
        + เพิ่ม Relay (เต็มโควตา)
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={available.length === 0}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3.5 py-2 transition disabled:opacity-40"
      >
        + เพิ่ม Relay
      </button>
    );
  }

  return (
    <form
      action={createRelay.bind(null, deviceId)}
      onSubmit={() => setOpen(false)}
      className="flex flex-wrap items-center gap-2"
    >
      <select name="channel" required className="rounded-lg border border-border px-2 py-1.5 text-xs">
        {available.map((c) => (
          <option key={c} value={c}>
            Channel {c}
          </option>
        ))}
      </select>
      <input
        name="name"
        placeholder="ชื่อ (เช่น ปั๊มน้ำ)"
        className="rounded-lg border border-border px-2 py-1.5 text-xs w-32"
      />
      <button type="submit" className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-1.5">
        เพิ่ม
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-full border border-border text-xs font-medium px-3 py-1.5 text-brand-800"
      >
        ยกเลิก
      </button>
    </form>
  );
}

export function DeleteRelayButton({ deviceId, relayId, relayName }: { deviceId: string; relayId: string; relayName: string }) {
  return (
    <form
      action={deleteRelay.bind(null, deviceId, relayId)}
      onSubmit={(e) => {
        if (!confirm(`ลบ Relay "${relayName}"?`)) e.preventDefault();
      }}
    >
      <button type="submit" className="text-[11px] text-red-600 hover:text-red-800 font-medium">
        ลบ
      </button>
    </form>
  );
}
