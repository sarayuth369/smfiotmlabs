import Link from "next/link";
import { formatLastSeenRelative } from "@/lib/device-status";

export type HealthDeviceRow = {
  id: string;
  device_uid: string;
  device_name: string;
  farm_id: string;
  farm_name: string | null;
  hardware_model: string | null;
  firmware_version: string | null;
  status: "healthy" | "warning" | "critical" | "offline";
  score: number;
  lastSeen: string | null;
  issueCount: number;
};

const STATUS: Record<HealthDeviceRow["status"], { label: string; cls: string; dot: string }> = {
  healthy: { label: "Healthy", cls: "bg-green-100 text-green-800", dot: "bg-green-500" },
  warning: { label: "Warning", cls: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  critical: { label: "Critical", cls: "bg-red-100 text-red-700", dot: "bg-red-500" },
  offline: { label: "Offline", cls: "bg-brand-100 text-brand-700/70", dot: "bg-brand-300" },
};

export function HealthDeviceCard({ device }: { device: HealthDeviceRow }) {
  const s = STATUS[device.status];
  return (
    <div className="card p-5 sm:p-6 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-lg font-bold text-brand-800 truncate">{device.device_name}</div>
          <div className="font-mono text-xs text-brand-900/60 mt-0.5">{device.device_uid}</div>
        </div>
        <div className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${s.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-brand-900/55">ฟาร์ม</dt>
          <dd className="font-semibold text-brand-800 truncate">{device.farm_name ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-brand-900/55">คะแนนสุขภาพ</dt>
          <dd className="font-semibold text-brand-800">{device.score}/100</dd>
        </div>
        <div>
          <dt className="text-xs text-brand-900/55">Hardware</dt>
          <dd className="font-semibold text-brand-800 truncate">{device.hardware_model ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-brand-900/55">Firmware</dt>
          <dd className="font-mono text-xs text-brand-800">{device.firmware_version ? `V${device.firmware_version}` : "-"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-brand-900/55">Last Seen</dt>
          <dd className="font-semibold text-brand-800">{formatLastSeenRelative(device.lastSeen)}</dd>
        </div>
        {device.issueCount > 0 && (
          <div className="col-span-2">
            <dt className="text-xs text-brand-900/55">ปัญหาที่พบ</dt>
            <dd className="font-semibold text-red-700">{device.issueCount} รายการ</dd>
          </div>
        )}
      </dl>

      <div className="mt-5">
        <Link
          href={`/dashboard/device-health/${device.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 transition"
        >
          ดูรายละเอียด
        </Link>
      </div>
    </div>
  );
}
