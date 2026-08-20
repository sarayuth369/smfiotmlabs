"use client";

import { useCallback, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reserveFirmwareUploads, createFirmwareRelease } from "../actions";
import type { ArtifactRole } from "@/lib/firmware-manifest";

type SlotState = {
  role: ArtifactRole;
  label: string;
  filename: string;
  file: File | null;
  sha256: string | null;
  size: number;
};

const REQUIRED: ArtifactRole[] = ["app"];
const SLOTS: Omit<SlotState, "file" | "sha256" | "size">[] = [
  { role: "bootloader", label: "Bootloader (bootloader.bin)", filename: "bootloader.bin" },
  { role: "partitions", label: "Partitions (partitions.bin)", filename: "partitions.bin" },
  { role: "boot_app0", label: "boot_app0.bin (optional)", filename: "boot_app0.bin" },
  { role: "app", label: "Application (firmware.bin) — REQUIRED", filename: "firmware.bin" },
];

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function UploadForm() {
  const [slots, setSlots] = useState<SlotState[]>(
    SLOTS.map((s) => ({ ...s, file: null, sha256: null, size: 0 }))
  );
  const [version, setVersion] = useState("0.1.0-test");
  const [build, setBuild] = useState(new Date().toISOString().slice(0, 10).replaceAll("-", ""));
  const [board] = useState("ESP32-S3");
  const [hardwareModel, setHardwareModel] = useState("SMF-MAIN-V1");
  const [channel, setChannel] = useState<"test" | "stable">("test");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const appendLog = (line: string) => setLog((p) => [...p.slice(-100), line]);

  const canSubmit = useMemo(() => {
    const hasApp = slots.find((s) => s.role === "app")?.file != null;
    return hasApp && /^\d+\.\d+\.\d+/.test(version) && hardwareModel.length > 0 && !busy;
  }, [slots, version, hardwareModel, busy]);

  const pickFile = useCallback(async (role: ArtifactRole, file: File | null) => {
    if (!file) {
      setSlots((prev) => prev.map((s) => (s.role === role ? { ...s, file: null, sha256: null, size: 0 } : s)));
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      setError(`${role}: file too large (>16 MB)`);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".bin")) {
      setError(`${role}: only .bin files accepted`);
      return;
    }
    setError(null);
    const buf = await file.arrayBuffer();
    const hash = await sha256Hex(buf);
    setSlots((prev) =>
      prev.map((s) => (s.role === role ? { ...s, file, sha256: hash, size: buf.byteLength } : s))
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setDone(null);
    setLog([]);
    setBusy(true);

    try {
      const filled = slots.filter((s) => s.file != null);
      const missingRequired = REQUIRED.filter((r) => !filled.find((s) => s.role === r));
      if (missingRequired.length > 0) {
        throw new Error(`missing required artifact: ${missingRequired.join(", ")}`);
      }
      const roles = filled.map((s) => s.role);
      appendLog(`Reserving upload slot for: ${roles.join(", ")}`);
      const reserved = await reserveFirmwareUploads(roles);
      if (!reserved.ok) throw new Error(`reserve failed: ${reserved.error}`);
      appendLog(`Release ID: ${reserved.release_id}`);

      // Upload each artifact via signed URL
      const supabase = createClient();
      const roleToPath: Record<string, string> = {};
      for (const entry of reserved.entries) {
        const slot = filled.find((s) => s.role === entry.role);
        if (!slot || !slot.file) throw new Error(`missing file for ${entry.role}`);
        appendLog(`Uploading ${entry.role} (${(slot.size / 1024).toFixed(1)} KB)…`);
        const { error: upErr } = await supabase.storage
          .from(reserved.bucket)
          .uploadToSignedUrl(entry.path, entry.token, slot.file, {
            contentType: "application/octet-stream",
            upsert: false,
          });
        if (upErr) throw new Error(`upload ${entry.role} failed: ${upErr.message}`);
        roleToPath[entry.role] = entry.path;
      }

      const app = filled.find((s) => s.role === "app")!;
      const bl = filled.find((s) => s.role === "bootloader");
      const pt = filled.find((s) => s.role === "partitions");
      const b0 = filled.find((s) => s.role === "boot_app0");

      const fd = new FormData();
      fd.set("release_id", reserved.release_id);
      fd.set("version", version.trim());
      fd.set("build", build.trim());
      fd.set("board", board);
      fd.set("hardware_model", hardwareModel.trim());
      fd.set("release_channel", channel);
      fd.set("release_notes", notes.trim());

      fd.set("app_path", app.file!.name === app.filename ? roleToPath.app : roleToPath.app);
      fd.set("app_size", String(app.size));
      fd.set("sha256_app", app.sha256!);

      if (bl) {
        fd.set("bootloader_path", roleToPath.bootloader);
        fd.set("bootloader_size", String(bl.size));
        fd.set("sha256_bootloader", bl.sha256!);
      }
      if (pt) {
        fd.set("partitions_path", roleToPath.partitions);
        fd.set("partitions_size", String(pt.size));
        fd.set("sha256_partitions", pt.sha256!);
      }
      if (b0) {
        fd.set("boot_app0_path", roleToPath.boot_app0);
        fd.set("boot_app0_size", String(b0.size));
        fd.set("sha256_boot_app0", b0.sha256!);
      }

      appendLog("Creating firmware_releases row…");
      const res = await createFirmwareRelease(fd);
      if (!res.ok) throw new Error(`create release: ${res.error}`);
      appendLog(`✓ Release created: ${res.release_id}`);
      setDone(res.release_id);
    } catch (e) {
      const msg = (e as Error).message ?? "unknown error";
      appendLog(`✗ ${msg}`);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [slots, version, build, board, hardwareModel, channel, notes]);

  return (
    <div className="card p-5">
      <h2 className="font-bold text-brand-800">Upload Firmware</h2>
      <p className="text-xs text-brand-900/60 mt-1 mb-4">
        เลือกไฟล์ .bin จาก PlatformIO build (<code className="font-mono">.pio/build/esp32-s3-devkitc-1/</code>). SHA256 คำนวณใน browser. Release row สร้างหลัง upload สำเร็จ.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 mb-4">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-brand-800/80 mb-1">Version (semver)</span>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="0.1.0-test"
            className="w-full rounded-lg border border-brand-200 px-3 py-2 font-mono text-sm"
            disabled={busy}
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-brand-800/80 mb-1">Build tag (optional)</span>
          <input
            type="text"
            value={build}
            onChange={(e) => setBuild(e.target.value)}
            className="w-full rounded-lg border border-brand-200 px-3 py-2 font-mono text-sm"
            disabled={busy}
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-brand-800/80 mb-1">Board</span>
          <input
            type="text"
            value={board}
            readOnly
            className="w-full rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 font-mono text-sm text-brand-900/70"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-brand-800/80 mb-1">Hardware Model</span>
          <input
            type="text"
            value={hardwareModel}
            onChange={(e) => setHardwareModel(e.target.value)}
            className="w-full rounded-lg border border-brand-200 px-3 py-2 font-mono text-sm"
            disabled={busy}
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-brand-800/80 mb-1">Channel</span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as "test" | "stable")}
            className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
            disabled={busy}
          >
            <option value="test">test</option>
            <option value="stable">stable</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="block text-xs font-semibold text-brand-800/80 mb-1">Release notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
            disabled={busy}
          />
        </label>
      </div>

      <div className="space-y-3">
        {slots.map((s) => (
          <div key={s.role} className="rounded-xl border border-brand-100 p-3">
            <div className="text-xs font-bold text-brand-800/80">{s.label}</div>
            <input
              type="file"
              accept=".bin,application/octet-stream"
              onChange={(e) => pickFile(s.role, e.target.files?.[0] ?? null)}
              disabled={busy}
              className="mt-2 block w-full text-sm"
            />
            {s.file && (
              <div className="mt-2 text-[11px] font-mono text-brand-900/70">
                {s.file.name} • {(s.size / 1024).toFixed(1)} KB
                <div className="break-all">sha256: {s.sha256}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 text-sm"
        >
          {busy ? "กำลัง Upload…" : "Upload & Create Release"}
        </button>
        {done && (
          <span className="text-sm text-green-700 font-semibold">
            ✓ Release created — approve + set latest ในตารางด้านล่าง
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {log.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs font-semibold text-brand-800 cursor-pointer">Log ({log.length})</summary>
          <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-brand-900/95 text-white/90 text-[11px] p-3 font-mono">
{log.join("\n")}
          </pre>
        </details>
      )}
    </div>
  );
}
