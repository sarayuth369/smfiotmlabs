"use client";

import { useState, useTransition } from "react";
import {
  disableUserAction,
  enableUserAction,
  deleteUserAction,
  rotatePasswordAction,
} from "../actions";
import { AdminInstallFlasher } from "./AdminInstallFlasher";
import type { ProvisionFirmwareBundle } from "@/app/dashboard/devices/actions";

export function UserRowActions({
  username,
  enabled,
  isProtected,
}: {
  username: string;
  enabled: boolean;
  isProtected: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateCustUuid, setRotateCustUuid] = useState("");
  const [rotatedPw, setRotatedPw] = useState<string | null>(null);
  const [rotatedFirmware, setRotatedFirmware] = useState<ProvisionFirmwareBundle | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function doToggle() {
    if (
      isProtected &&
      !confirm(`"${username}" ดูเหมือนเป็น bridge/service account — ${enabled ? "ปิด" : "เปิด"} ใช้งานจริงหรือไม่?`)
    )
      return;
    startTransition(async () => {
      const r = enabled ? await disableUserAction(username) : await enableUserAction(username);
      if (!r.ok) alert("ล้มเหลว: " + r.error);
    });
  }

  function doDelete() {
    if (!confirm(`ลบ MQTT user "${username}" ถาวร?\n\nจะลบ EMQX user + ACL rules ทันที (Supabase device data ไม่ถูกลบ)`)) return;
    startTransition(async () => {
      const r = await deleteUserAction(username);
      if (!r.ok) alert("ล้มเหลว: " + r.error);
    });
  }

  function doRotate() {
    setErr(null);
    startTransition(async () => {
      const r = await rotatePasswordAction(username, rotateCustUuid.trim());
      if (r.ok) {
        setRotatedPw(r.password);
        setRotatedFirmware(r.firmware);
      } else setErr(r.error);
    });
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={doToggle}
        disabled={pending}
        className={`text-[11px] rounded-full border px-2.5 py-1 font-semibold transition disabled:opacity-50 ${
          enabled
            ? "border-amber-200 hover:bg-amber-50 text-amber-800"
            : "border-green-200 hover:bg-green-50 text-green-800"
        }`}
      >
        {enabled ? "ปิดใช้งาน" : "เปิดใช้งาน"}
      </button>

      <button
        type="button"
        onClick={() => setRotateOpen((v) => !v)}
        className="text-[11px] rounded-full border border-brand-200 hover:bg-brand-50 text-brand-800 px-2.5 py-1 font-semibold transition"
      >
        Rotate Password
      </button>

      <button
        type="button"
        onClick={doDelete}
        disabled={pending}
        className="text-[11px] rounded-full border border-red-200 hover:bg-red-50 text-red-700 px-2.5 py-1 font-semibold transition disabled:opacity-50"
      >
        ลบ
      </button>

      {rotateOpen && (
        <div className="w-full mt-2 p-3 rounded-lg border border-brand-200 bg-brand-50/50 space-y-2">
          {rotatedPw ? (
            <>
              <div className="text-xs font-bold text-amber-900">⚠ Password ใหม่ (ครั้งเดียว):</div>
              <code className="block font-mono text-xs bg-white border border-amber-200 rounded px-2 py-1.5 break-all">
                {rotatedPw}
              </code>
              {rotatedFirmware?.available ? (
                <AdminInstallFlasher
                  deviceUid={username}
                  releaseVersion={rotatedFirmware.release_version}
                  artifacts={rotatedFirmware.artifacts}
                />
              ) : (
                rotatedFirmware && (
                  <div className="text-[11px] text-amber-800">⚠ Flash ไม่ได้: {rotatedFirmware.reason}</div>
                )
              )}
              <button
                type="button"
                onClick={() => {
                  setRotateOpen(false);
                  setRotatedPw(null);
                  setRotatedFirmware(null);
                }}
                className="text-[11px] rounded-full border border-border px-3 py-1 font-medium text-brand-800"
              >
                ปิด
              </button>
            </>
          ) : (
            <>
              <label className="block text-[11px] font-semibold text-brand-900/70">
                Customer UUID (ของ user เดิม)
              </label>
              <input
                value={rotateCustUuid}
                onChange={(e) => setRotateCustUuid(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded border border-border px-2 py-1.5 text-xs font-mono"
              />
              {err && <div className="text-[11px] text-red-700">{err}</div>}
              <button
                type="button"
                onClick={doRotate}
                disabled={pending || !rotateCustUuid.trim()}
                className="text-[11px] rounded-full bg-brand-600 hover:bg-brand-700 text-white px-3 py-1 font-semibold disabled:opacity-50"
              >
                Rotate
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
