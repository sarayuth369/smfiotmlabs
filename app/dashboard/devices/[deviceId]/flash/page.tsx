import Link from "next/link";
import { notFound } from "next/navigation";
import { getFirmwareOverview } from "./actions";
import { Flasher } from "./_components/Flasher";

export const dynamic = "force-dynamic";

export default async function FlashPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  const overview = await getFirmwareOverview(deviceId);
  if (!overview) notFound();

  const { device, current_version, latest } = overview;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/devices/${deviceId}`} className="hover:text-brand-900">
          ← กลับหน้าอุปกรณ์
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-brand-800 mb-1">Flash Firmware ผ่าน USB</h1>
      <p className="text-sm text-brand-900/60 mb-6">
        เชื่อม ESP32-S3 ผ่านสาย USB-C แล้วกดปุ่ม Flash — เบราว์เซอร์จะเขียน firmware ตรงไปที่ chip
      </p>

      <div className="card p-5 mb-5">
        <h2 className="text-sm font-bold text-brand-800 mb-3">ข้อมูลอุปกรณ์</h2>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-brand-900/55">ชื่ออุปกรณ์</dt>
            <dd className="font-semibold text-brand-800">{device.device_name}</dd>
          </div>
          <div>
            <dt className="text-xs text-brand-900/55">Device UID</dt>
            <dd className="font-mono font-semibold text-brand-800">{device.device_uid}</dd>
          </div>
          <div>
            <dt className="text-xs text-brand-900/55">Hardware Model</dt>
            <dd className="font-mono text-brand-800">{device.hardware_model ?? "— (จะกำหนดหลัง flash)"}</dd>
          </div>
          <div>
            <dt className="text-xs text-brand-900/55">Firmware ปัจจุบัน</dt>
            <dd className="font-mono text-brand-800">{current_version ?? "— ยังไม่เคย report —"}</dd>
          </div>
        </dl>
      </div>

      <div className="card p-5 mb-5">
        <h2 className="text-sm font-bold text-brand-800 mb-3">Firmware ล่าสุด</h2>
        {latest ? (
          <dl className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-brand-900/55">Version</dt>
              <dd className="font-mono font-semibold text-brand-800">v{latest.version}{latest.build ? ` (${latest.build})` : ""}</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-900/55">Board</dt>
              <dd className="font-mono text-brand-800">{latest.board}</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-900/55">Hardware Model</dt>
              <dd className="font-mono text-brand-800">{latest.hardware_model}</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-900/55">Channel</dt>
              <dd className="font-mono uppercase text-brand-800">{latest.channel}</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-900/55">ขนาดรวม</dt>
              <dd className="text-brand-800">{(latest.total_size / 1024).toFixed(1)} KB</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-brand-900/55">SHA256 (app)</dt>
              <dd className="font-mono text-[11px] break-all text-brand-800/80">{latest.sha256_app}</dd>
            </div>
          </dl>
        ) : (
          <div className="rounded-xl border border-dashed border-brand-200 p-6 text-center text-sm text-brand-900/60">
            ยังไม่มี firmware ที่อนุมัติสำหรับ hardware model นี้ — ติดต่อผู้ดูแลระบบ
          </div>
        )}
      </div>

      {latest ? (
        <Flasher
          deviceId={deviceId}
          releaseId={latest.release_id}
          latestVersion={latest.version}
          deviceName={device.device_name}
          deviceUid={device.device_uid}
        />
      ) : null}

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
        <strong>⚠ ข้อควรระวัง:</strong> Flash เฉพาะ ESP32-S3 ที่คุณเป็นเจ้าของเท่านั้น — ห้าม flash device ของคนอื่น ห้าม flash SMF001 production ถ้าคุณไม่แน่ใจ
      </div>
    </div>
  );
}
