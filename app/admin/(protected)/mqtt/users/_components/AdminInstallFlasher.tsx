"use client";

// Adapted from app/dashboard/devices/_components/ProvisionInstallFlasher.tsx
// for the admin standalone-credential flow, which has no Supabase iot_nodes
// row to poll last_seen against. Deliberately a separate file rather than a
// shared one with an injected callback — the customer flow is
// battle-tested (Phase 6.5, 6 iterations to get firmware patching right)
// and must not risk regression from this admin-only variant.

import { useCallback, useEffect, useState } from "react";
import { checkUserOnlineAction } from "../actions";
import type { FirmwareArtifactB64 } from "@/app/dashboard/devices/actions";

type Props = {
  deviceUid: string;
  releaseVersion: string;
  artifacts: FirmwareArtifactB64[];
};

type Phase =
  | "checking-browser"
  | "unsupported"
  | "ready"
  | "connecting"
  | "detected"
  | "flashing"
  | "rebooting"
  | "waiting-online"
  | "online"
  | "failed";

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

async function verifySha256(bytes: Uint8Array, expected: string): Promise<boolean> {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === expected.toLowerCase();
}

export function AdminInstallFlasher({ deviceUid, releaseVersion, artifacts }: Props) {
  const [phase, setPhase] = useState<Phase>("checking-browser");
  const [chip, setChip] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ role: string; written: number; total: number }[]>([]);
  const [totalPercent, setTotalPercent] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [waitStart, setWaitStart] = useState<number | null>(null);
  const [sessionCount, setSessionCount] = useState(0);

  const appendLog = useCallback((s: string) => {
    setLog((p) => [...p.slice(-200), s]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) {
      setError("ต้องเข้าผ่าน HTTPS เท่านั้น");
      setPhase("unsupported");
      return;
    }
    if (!("serial" in navigator)) {
      setError("เบราว์เซอร์ไม่รองรับ Web Serial — ใช้ Chrome / Edge / Brave desktop");
      setPhase("unsupported");
      return;
    }
    setPhase("ready");
  }, []);

  // Poll EMQX for an active session under this username after flash + reboot.
  useEffect(() => {
    if (phase !== "waiting-online") return;
    if (waitStart === null) return;
    let cancelled = false;
    const start = waitStart;

    async function tick() {
      if (cancelled) return;
      const res = await checkUserOnlineAction(deviceUid);
      if (cancelled) return;
      setSessionCount(res.session_count);
      if (res.online) {
        setPhase("online");
        appendLog("✓ Device ONLINE — " + res.session_count + " active MQTT session(s)");
        return;
      }
      if (Date.now() - start > 120_000) {
        setPhase("failed");
        setError("รอ MQTT connect timeout (120s) — ตรวจ WiFi, Serial log, หรือลองใหม่");
        return;
      }
      setTimeout(tick, 4000);
    }
    tick();
    return () => {
      cancelled = true;
    };
  }, [phase, waitStart, deviceUid, appendLog]);

  const runFlash = useCallback(async () => {
    setError(null);
    setLog([]);
    setProgress([]);
    setTotalPercent(0);
    setChip(null);

    let transport: { disconnect: () => Promise<void> } | null = null;
    try {
      setPhase("connecting");
      appendLog("Requesting USB port…");
      let port: unknown;
      try {
        port = await (navigator as unknown as { serial: { requestPort: () => Promise<unknown> } }).serial.requestPort();
      } catch (e) {
        if ((e as Error).name === "NotFoundError") throw new Error("ยกเลิกเลือก USB device");
        throw e;
      }

      appendLog("Loading esptool-js…");
      const esptool = await import("esptool-js");
      const t = new esptool.Transport(port as never, true);
      transport = t;
      const loader = new esptool.ESPLoader({
        transport: t,
        baudrate: 921600,
        romBaudrate: 115200,
      } as unknown as ConstructorParameters<typeof esptool.ESPLoader>[0]);

      appendLog("Detecting chip…");
      const detected = await loader.main();
      setChip(detected);
      appendLog("Chip: " + detected);
      if (!detected.toUpperCase().startsWith("ESP32-S3")) {
        throw new Error("ต้องเป็น ESP32-S3 เท่านั้น (พบ: " + detected + ")");
      }
      setPhase("detected");

      appendLog("Decoding + verifying firmware artifacts…");
      const files: { address: number; data: Uint8Array; role: string }[] = [];
      let totalBytes = 0;
      for (const a of artifacts) {
        const bytes = base64ToUint8Array(a.bytes_b64);
        const shaOk = await verifySha256(bytes, a.sha256);
        if (!shaOk) throw new Error("SHA256 mismatch for " + a.role);
        appendLog("  " + a.role + ": " + (bytes.byteLength / 1024).toFixed(1) + " KB @ 0x" + a.offset.toString(16) + " ✓");
        files.push({ address: a.offset, data: bytes, role: a.role });
        totalBytes += bytes.byteLength;
      }

      setPhase("flashing");
      appendLog("Writing " + (totalBytes / 1024).toFixed(1) + " KB total…");
      const initProgress = files.map((f) => ({ role: f.role, written: 0, total: f.data.length }));
      setProgress(initProgress);

      // See ProvisionInstallFlasher.tsx for why flash params must stay
      // "keep" — an esptool-js SHA-rewrite bug corrupts the bootloader
      // otherwise. app.bin credentials/checksum are patched server-side.
      await loader.writeFlash({
        fileArray: files.map((f) => ({ data: f.data, address: f.address })) as unknown as {
          data: Uint8Array;
          address: number;
        }[],
        flashMode: "keep",
        flashFreq: "keep",
        flashSize: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex: number, written: number, total: number) => {
          setProgress((prev) => {
            const next = [...prev];
            if (next[fileIndex]) next[fileIndex] = { ...next[fileIndex], written, total };
            const sumWritten = next.reduce((s, x) => s + x.written, 0);
            const sumTotal = next.reduce((s, x) => s + x.total, 0);
            setTotalPercent(sumTotal > 0 ? Math.round((sumWritten * 100) / sumTotal) : 0);
            return next;
          });
        },
      } as unknown as Parameters<typeof loader.writeFlash>[0]);

      setPhase("rebooting");
      appendLog("Flash complete — resetting ESP32…");
      try {
        await loader.after("hard_reset");
      } catch {
        /* ignore */
      }
      try {
        await t.disconnect();
      } catch {
        /* already closed */
      }
      transport = null;

      appendLog("รอ ESP32 เชื่อม WiFi + TLS + MQTT (สูงสุด 120 วิ)…");
      setWaitStart(Date.now());
      setPhase("waiting-online");
    } catch (e) {
      const msg = (e as Error).message || "unknown flash error";
      setError(msg);
      appendLog("✗ " + msg);
      if (transport) {
        try { await transport.disconnect(); } catch { /* ignore */ }
      }
      setPhase("failed");
    }
  }, [artifacts, appendLog]);

  const reset = () => {
    setPhase("ready");
    setChip(null);
    setError(null);
    setProgress([]);
    setTotalPercent(0);
    setWaitStart(null);
    setLog([]);
  };

  if (phase === "checking-browser") {
    return <div className="text-sm text-brand-900/60">กำลังตรวจสอบเบราว์เซอร์…</div>;
  }
  if (phase === "unsupported") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="text-red-800 font-bold text-sm">เบราว์เซอร์ไม่รองรับ</div>
        <p className="text-xs text-red-900 mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-white p-4 space-y-3">
      <div>
        <div className="text-[11px] uppercase font-bold tracking-wider text-brand-900/60">Firmware v{releaseVersion}</div>
        <div className="text-xs text-brand-900/70 mt-0.5">
          Flash <strong>{deviceUid}</strong> — {artifacts.length} artifacts
        </div>
      </div>

      {(phase === "ready" || phase === "failed") && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runFlash}
            className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 text-xs"
          >
            {phase === "failed" ? "ลอง Flash ใหม่" : "🔌 ติดตั้ง Firmware"}
          </button>
          {phase === "failed" && (
            <button
              onClick={reset}
              className="rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 font-semibold px-4 py-2 text-xs"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {phase === "online" && (
        <div className="rounded-lg border-2 border-green-400 bg-green-50 p-3">
          <div className="text-green-800 font-bold text-sm">✅ Device ONLINE</div>
          <div className="text-xs text-green-900 mt-1">
            {deviceUid} เชื่อมต่อสำเร็จ — {sessionCount} active session(s)
          </div>
          <button
            onClick={reset}
            className="mt-2 rounded-full border border-green-300 hover:border-green-500 text-green-800 font-semibold px-3 py-1 text-[11px]"
          >
            Flash Again
          </button>
        </div>
      )}

      {phase !== "ready" && phase !== "failed" && phase !== "online" && (
        <div className="text-xs text-brand-800">
          <span className="font-bold uppercase tracking-wider text-[10px] mr-2">Status:</span>
          {phase}
          {chip && <span className="ml-2 font-mono text-[10px]">chip={chip}</span>}
        </div>
      )}

      {progress.length > 0 && phase !== "online" && (
        <div className="space-y-1.5">
          <div className="h-2 w-full rounded-full bg-brand-100 overflow-hidden">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${totalPercent}%` }} />
          </div>
          <div className="text-[11px] text-brand-900/70 font-mono">Total: {totalPercent}%</div>
        </div>
      )}

      {phase === "waiting-online" && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          รอ ESP32 boot + WiFi + MQTT connect… ({sessionCount} session ตอนนี้)
        </div>
      )}

      {error && phase === "failed" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {log.length > 0 && (
        <details>
          <summary className="text-[11px] font-semibold text-brand-800 cursor-pointer">Log ({log.length})</summary>
          <pre className="mt-1.5 max-h-48 overflow-auto rounded-lg bg-brand-900/95 text-white/90 text-[10px] p-2.5 font-mono">
{log.join("\n")}
          </pre>
        </details>
      )}

      {(phase === "flashing" || phase === "rebooting" || phase === "waiting-online") && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <strong>ห้ามถอด USB หรือปิด tab</strong> จนกว่าจะเห็น ✅ Device ONLINE
        </div>
      )}
    </div>
  );
}
