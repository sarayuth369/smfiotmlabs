"use client";

import { useEffect, useState, useTransition } from "react";
import { getUserDetailAction, rotatePasswordAction } from "../actions";
import { AdminInstallFlasher } from "./AdminInstallFlasher";
import type { MqttUserDetail } from "@/lib/admin/mqtt-webhook";
import type { ProvisionFirmwareBundle } from "@/app/dashboard/devices/actions";

export function UserDetailModal({ username, onClose }: { username: string; onClose: () => void }) {
  const [detail, setDetail] = useState<MqttUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [custUuid, setCustUuid] = useState("");
  const [rotating, startRotate] = useTransition();
  const [rotatedPw, setRotatedPw] = useState<string | null>(null);
  const [rotatedFirmware, setRotatedFirmware] = useState<ProvisionFirmwareBundle | null>(null);
  const [rotateErr, setRotateErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUserDetailAction(username).then((r) => {
      if (cancelled) return;
      if (r.ok) setDetail(r.detail);
      else setError(r.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  function doRotate() {
    setRotateErr(null);
    startRotate(async () => {
      const r = await rotatePasswordAction(username, custUuid.trim());
      if (r.ok) {
        setRotatedPw(r.password);
        setRotatedFirmware(r.firmware);
      } else {
        setRotateErr(r.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="card w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-brand-900/55">MQTT User</div>
            <h2 className="text-lg font-bold text-brand-800 font-mono">{username}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-brand-900/50 hover:text-brand-800 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 text-xs text-brand-900/70">
          🔒 Password ไม่สามารถดูย้อนหลังได้ (ระบบเก็บเฉพาะ bcrypt hash) — ใช้ &quot;Rotate + Flash&quot; ด้านล่างเพื่อรับ password ใหม่
        </div>

        {loading && <div className="text-sm text-brand-900/50">กำลังโหลด...</div>}
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

        {detail && (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-brand-900/55">สถานะ</div>
                <span
                  className={`inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    detail.enabled ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                  }`}
                >
                  {detail.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div>
                <div className="text-xs text-brand-900/55">Active Sessions</div>
                <div className="font-semibold text-brand-800 mt-0.5">{detail.sessions.length}</div>
              </div>
            </div>

            {detail.sessions.length > 0 && (
              <div>
                <div className="text-xs font-bold text-brand-900/60 uppercase tracking-wider mb-1.5">Sessions</div>
                <div className="space-y-1.5">
                  {detail.sessions.map((s) => (
                    <div key={s.clientid} className="text-xs font-mono bg-brand-50/60 border border-brand-100 rounded-lg px-2.5 py-1.5">
                      {s.clientid} · {s.ip_address ?? "-"} · {s.connected_at ? new Date(s.connected_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "-"}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-xs font-bold text-brand-900/60 uppercase tracking-wider mb-1.5">
                ACL Rules ({detail.acl_rules.length})
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {detail.acl_rules.map((r, i) => (
                  <div key={i} className="text-[11px] font-mono flex items-center gap-2">
                    <span
                      className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        r.action === "publish" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                      }`}
                    >
                      {r.action}
                    </span>
                    <span className="text-brand-900/70 break-all">{r.topic}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="border-t border-border pt-4">
          <div className="text-xs font-bold text-brand-900/60 uppercase tracking-wider mb-2">
            Rotate Password + Flash
          </div>
          {rotatedPw ? (
            <div className="space-y-2">
              <div className="text-xs font-bold text-amber-900">⚠ Password ใหม่ (ครั้งเดียว):</div>
              <code className="block font-mono text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5 break-all">
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
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={custUuid}
                onChange={(e) => setCustUuid(e.target.value)}
                placeholder="Customer UUID (ของ user เดิม)"
                className="w-full rounded-lg border border-border px-3 py-2 text-xs font-mono"
              />
              {rotateErr && <div className="text-xs text-red-700">{rotateErr}</div>}
              <button
                type="button"
                onClick={doRotate}
                disabled={rotating || !custUuid.trim()}
                className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50"
              >
                {rotating ? "กำลัง Rotate..." : "Rotate Password"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
