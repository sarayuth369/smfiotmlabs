"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getFirmwareManifest,
  startUsbFlashJob,
  completeUsbFlashJob,
} from "../actions";
import {
  isValidManifest,
  verifyArtifactSha256,
  type FirmwareManifest,
} from "@/lib/firmware-manifest";

type Props = {
  deviceId: string;
  releaseId: string;
  latestVersion: string;
  deviceName: string;
  deviceUid: string;
};

type Phase =
  | "idle"
  | "checking-browser"
  | "unsupported"
  | "ready"
  | "connecting"
  | "detected"
  | "confirming"
  | "downloading"
  | "flashing"
  | "verifying"
  | "rebooting"
  | "success"
  | "failed";

type FileProgress = { role: string; written: number; total: number };

export function Flasher({ deviceId, releaseId, latestVersion, deviceName, deviceUid }: Props) {
  const [phase, setPhase] = useState<Phase>("checking-browser");
  const [chip, setChip] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<FileProgress[]>([]);
  const [totalPercent, setTotalPercent] = useState(0);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-200), line]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Detect Web Serial + secure context once on mount; sync to external browser capability.
    const check = () => {
      if (!window.isSecureContext) {
    setError("ต้องเข้าผ่าน HTTPS เท่านั้น (https://smfiot.bkknex.com)");
    setPhase("unsupported");
        return;
      }
      if (!("serial" in navigator)) {
    setError("เบราว์เซอร์ไม่รองรับ Web Serial — ใช้ Chrome / Edge / Brave desktop");
    setPhase("unsupported");
        return;
      }
setPhase("ready");
    };
    check();
  }, []);

  const reset = useCallback(() => {
    setPhase("ready");
    setChip(null);
    setError(null);
    setProgress([]);
    setTotalPercent(0);
    setLog([]);
  }, []);

  const runFlash = useCallback(async () => {
    if (phase !== "ready" && phase !== "failed") return;
    setError(null);
    setLog([]);
    setProgress([]);
    setTotalPercent(0);

    let jobId: string | null = null;
    let transport: { disconnect: () => Promise<void> } | null = null;

    try {
      // 1. Request USB port (user must pick from browser prompt)
      setPhase("connecting");
      appendLog("Requesting USB port…");
      let port: unknown;
      try {
        port = await (navigator as unknown as { serial: { requestPort: () => Promise<unknown> } }).serial.requestPort();
      } catch (e) {
        if ((e as Error).name === "NotFoundError") throw new Error("ไม่ได้เลือก USB device");
        throw e;
      }

      // 2. Load esptool-js dynamically
      appendLog("Loading esptool-js…");
      const esptool = await import("esptool-js");
      const t = new esptool.Transport(port, true);
      transport = t;
      const loader = new esptool.ESPLoader({
        transport: t,
        baudrate: 921600,
        romBaudrate: 115200,
      } as unknown as ConstructorParameters<typeof esptool.ESPLoader>[0]);

      // 3. Chip detect
      appendLog("Detecting chip…");
      const detected = await loader.main();
      setChip(detected);
      appendLog(`Chip: ${detected}`);
      if (!detected.toUpperCase().startsWith("ESP32-S3")) {
        throw new Error(`ต้องเป็น ESP32-S3 เท่านั้น (พบ: ${detected})`);
      }
      setPhase("detected");

      // 4. Fetch manifest (signed URLs, 60s TTL)
      setPhase("downloading");
      appendLog("Fetching firmware manifest…");
      const manifestRes = await getFirmwareManifest(deviceId, releaseId);
      if (!manifestRes.ok) throw new Error(`Manifest: ${manifestRes.error}`);
      const manifest: FirmwareManifest = manifestRes.manifest;
      if (!isValidManifest(manifest)) throw new Error("Manifest invalid");
      if (manifest.board !== "ESP32-S3") throw new Error("Manifest board mismatch");

      // 5. Insert firmware_update_jobs row (state=installing)
      appendLog("Recording flash job…");
      const jobRes = await startUsbFlashJob(deviceId, releaseId);
      if (!jobRes.ok) throw new Error(jobRes.error);
      jobId = jobRes.job_id;

      // 6. Download each artifact via signed URL + verify SHA256
      const files: { address: number; data: Uint8Array; role: string }[] = [];
      let totalBytes = 0;
      for (const a of manifest.artifacts) {
        appendLog(`Downloading ${a.role} (${a.offset.toString(16)})…`);
        const res = await fetch(a.url);
        if (!res.ok) throw new Error(`download ${a.role} failed: HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const ok = await verifyArtifactSha256(buf, a.sha256);
        if (!ok) throw new Error(`SHA256 mismatch for ${a.role}`);
        appendLog(`  ${a.role}: ${(buf.byteLength / 1024).toFixed(1)} KB, sha256 ✓`);
        files.push({ address: a.offset, data: new Uint8Array(buf), role: a.role });
        totalBytes += buf.byteLength;
      }

      // 7. Flash
      setPhase("flashing");
      appendLog(`Writing ${(totalBytes / 1024).toFixed(1)} KB total…`);
      const initProgress: FileProgress[] = files.map((f) => ({
        role: f.role,
        written: 0,
        total: f.data.length,
      }));
      setProgress(initProgress);

      // esptool-js expects fileArray items as { data, address } where data can be Uint8Array
      const fileArray = files.map((f) => ({ data: f.data, address: f.address }));

      await loader.writeFlash({
        fileArray: fileArray as unknown as {
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

      // 8. Verify + reboot via hard reset
      setPhase("verifying");
      appendLog("Flash complete — resetting…");
      setPhase("rebooting");
      try {
        await loader.after("hard_reset");
      } catch (e) {
        appendLog(`hard reset warning: ${(e as Error).message}`);
      }
      try {
        await t.disconnect();
      } catch {
        /* transport already closed */
      }
      transport = null;

      if (jobId) {
        await completeUsbFlashJob(jobId, "success", null);
      }
      setPhase("success");
      appendLog("✓ Firmware update successful");
    } catch (e) {
      const msg = (e as Error).message || "unknown flash error";
      setError(msg);
      appendLog(`✗ ${msg}`);
      if (jobId) {
        try {
          await completeUsbFlashJob(jobId, "failed", msg);
        } catch {
          /* ignore */
        }
      }
      if (transport) {
        try {
          await transport.disconnect();
        } catch {
          /* ignore */
        }
      }
      setPhase("failed");
    }
  }, [phase, deviceId, releaseId, appendLog]);

  const busy =
    phase === "connecting" ||
    phase === "downloading" ||
    phase === "flashing" ||
    phase === "verifying" ||
    phase === "rebooting";

  if (phase === "checking-browser") {
    return <div className="card p-5 text-sm text-brand-900/60">กำลังตรวจสอบเบราว์เซอร์…</div>;
  }
  if (phase === "unsupported") {
    return (
      <div className="card p-5">
        <div className="text-red-700 font-semibold">เบราว์เซอร์ไม่รองรับ</div>
        <p className="text-sm text-brand-900/70 mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-4">
        <div className="text-xs uppercase font-bold tracking-wider text-brand-900/60">Flash Confirmation</div>
        <p className="text-sm text-brand-900/70 mt-1">
          Make sure the correct ESP32-S3 device is connected via USB-C. This will flash <strong>v{latestVersion}</strong> to <strong>{deviceName}</strong> ({deviceUid}).
        </p>
      </div>

      {phase === "ready" || phase === "failed" ? (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={runFlash}
            className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
          >
            {phase === "failed" ? "Retry Flash" : "Connect & Flash ESP32"}
          </button>
          {phase === "failed" ? (
            <button
              onClick={reset}
              className="rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 font-semibold px-6 py-2.5 text-sm"
            >
              Reset
            </button>
          ) : null}
        </div>
      ) : phase === "success" ? (
        <div>
          <div className="text-green-700 font-bold text-lg">✓ Firmware update successful</div>
          <p className="text-sm text-brand-900/70 mt-1">
            ESP32 กำลัง reboot — เปิด Serial Monitor เพื่อดู boot log หรือดูสถานะ Online ในหน้า Device (30s)
          </p>
          <button
            onClick={reset}
            className="mt-3 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 font-semibold px-5 py-2 text-sm"
          >
            Flash Again
          </button>
        </div>
      ) : (
        <div>
          <div className="text-sm text-brand-800">
            <span className="font-bold uppercase tracking-wider text-xs mr-2">Status:</span>
            {phase}
            {chip ? <span className="ml-2 font-mono text-xs">chip={chip}</span> : null}
          </div>
        </div>
      )}

      {progress.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full rounded-full bg-brand-100 overflow-hidden">
            <div
              className="h-full bg-brand-600 transition-all"
              style={{ width: `${totalPercent}%` }}
            />
          </div>
          <div className="text-xs text-brand-900/70 font-mono">
            Total: {totalPercent}%
          </div>
          {progress.map((p, i) => (
            <div key={i} className="text-xs text-brand-900/60 font-mono">
              {p.role}: {p.total > 0 ? Math.round((p.written * 100) / p.total) : 0}%
              ({p.written}/{p.total} bytes)
            </div>
          ))}
        </div>
      )}

      {error && phase === "failed" && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {log.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs font-semibold text-brand-800 cursor-pointer">แสดง Log ({log.length})</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-brand-900/95 text-white/90 text-[11px] p-3 font-mono">
{log.join("\n")}
          </pre>
        </details>
      )}

      {busy && (
        <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          กำลังทำงาน — <strong>ห้ามถอด USB หรือปิด tab</strong> จนกว่าจะเสร็จ
        </div>
      )}
    </div>
  );
}
