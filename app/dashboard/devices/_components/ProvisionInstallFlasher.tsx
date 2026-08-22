"use client";

import { useCallback, useEffect, useState } from "react";
import { checkDeviceOnline } from "../actions";
import type { FirmwareArtifactB64 } from "../actions";

type Props = {
  deviceId: string;
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

export function ProvisionInstallFlasher({ deviceId, deviceUid, releaseVersion, artifacts }: Props) {
  const [phase, setPhase] = useState<Phase>("checking-browser");
  const [chip, setChip] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ role: string; written: number; total: number }[]>([]);
  const [totalPercent, setTotalPercent] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [waitStart, setWaitStart] = useState<number | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  const appendLog = useCallback((s: string) => {
    setLog((p) => [...p.slice(-200), s]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) {
      setError("ต้องเข้าผ่าน HTTPS (https://smfiot.bkknex.com) เท่านั้น");
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

  // Poll device online after flash + reboot
  useEffect(() => {
    if (phase !== "waiting-online") return;
    if (waitStart === null) return;
    let cancelled = false;
    const start = waitStart;

    async function tick() {
      if (cancelled) return;
      const res = await checkDeviceOnline(deviceId);
      if (cancelled) return;
      setLastSeen(res.last_seen);
      if (res.online) {
        setPhase("online");
        appendLog("✓ Device ONLINE — last_seen " + res.last_seen);
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
  }, [phase, waitStart, deviceId, appendLog]);

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

      // CRITICAL: use "keep" for all flash params. esptool-js has a bug when
      // rewriting the bootloader SHA suffix after modifying header bytes 2-3
      // (esploader.js line 1288 hashes imageDataAfterSha instead of
      // imageDataBeforeSha — writes garbage SHA). "keep" makes esptool-js
      // return early ("Not changing the image", line 1224) so the compiled
      // bootloader.bin flash mode + hash stay byte-exact.
      //
      // The app.bin ProvisioningSlot patch + SHA suffix rewrite happens
      // server-side in lib/firmware-patcher.ts (correct hash algorithm).
      //
      // compress: true is safe — the previous "SHA-256 comparison failed"
      // was caused by the flash-params bug above, not compression.
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

      // Move to polling for online status.
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
    return <div className="card p-5 text-sm text-brand-900/60">กำลังตรวจสอบเบราว์เซอร์…</div>;
  }
  if (phase === "unsupported") {
    return (
      <div className="card p-5 border-red-200 bg-red-50">
        <div className="text-red-800 font-bold">เบราว์เซอร์ไม่รองรับ</div>
        <p className="text-sm text-red-900 mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <div className="text-xs uppercase font-bold tracking-wider text-brand-900/60">Firmware v{releaseVersion}</div>
        <div className="text-sm text-brand-900/70 mt-1">
          Flash <strong>{deviceUid}</strong> — {artifacts.length} artifacts (bootloader + partitions + firmware)
        </div>
      </div>

      {(phase === "ready" || phase === "failed") && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={runFlash}
            className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm"
          >
            {phase === "failed" ? "ลอง Flash ใหม่" : "🔌 ติดตั้ง Firmware"}
          </button>
          {phase === "failed" && (
            <button
              onClick={reset}
              className="rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 font-semibold px-5 py-2.5 text-sm"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {phase === "online" && (
        <div className="rounded-xl border-2 border-green-400 bg-green-50 p-4">
          <div className="text-green-800 font-bold text-lg">✅ Device ONLINE</div>
          <div className="text-sm text-green-900 mt-1">
            {deviceUid} เชื่อมต่อ mqtt.bkknex.com สำเร็จ. last_seen: {lastSeen}
          </div>
          <button
            onClick={reset}
            className="mt-3 rounded-full border border-green-300 hover:border-green-500 text-green-800 font-semibold px-4 py-1.5 text-xs"
          >
            Flash Again
          </button>
        </div>
      )}

      {phase !== "ready" && phase !== "failed" && phase !== "online" && (
        <div className="text-sm text-brand-800">
          <span className="font-bold uppercase tracking-wider text-xs mr-2">Status:</span>
          {phase}
          {chip && <span className="ml-2 font-mono text-xs">chip={chip}</span>}
        </div>
      )}

      {progress.length > 0 && phase !== "online" && (
        <div className="space-y-2">
          <div className="h-3 w-full rounded-full bg-brand-100 overflow-hidden">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${totalPercent}%` }} />
          </div>
          <div className="text-xs text-brand-900/70 font-mono">Total: {totalPercent}%</div>
          {progress.map((p, i) => (
            <div key={i} className="text-xs text-brand-900/60 font-mono">
              {p.role}: {p.total > 0 ? Math.round((p.written * 100) / p.total) : 0}% ({p.written}/{p.total} bytes)
            </div>
          ))}
        </div>
      )}

      {phase === "waiting-online" && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          รอ ESP32 boot + WiFi + MQTT connect… (last_seen: {lastSeen ?? "ยังไม่เคย"})
        </div>
      )}

      {error && phase === "failed" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {log.length > 0 && (
        <details>
          <summary className="text-xs font-semibold text-brand-800 cursor-pointer">Log ({log.length})</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-brand-900/95 text-white/90 text-[11px] p-3 font-mono">
{log.join("\n")}
          </pre>
        </details>
      )}

      {(phase === "flashing" || phase === "rebooting" || phase === "waiting-online") && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <strong>ห้ามถอด USB หรือปิด tab</strong> จนกว่าจะเห็น ✅ Device ONLINE
        </div>
      )}
    </div>
  );
}
