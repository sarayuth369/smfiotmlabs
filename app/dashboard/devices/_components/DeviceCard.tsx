import Link from "next/link";
import { computeDeviceStatus, formatLastSeenRelative } from "@/lib/device-status";
import { ArchiveDeviceButton, RestoreDeviceButton } from "./DeviceArchiveButtons";

export type DeviceRow = {
  id: string;
  device_uid: string;
  device_name: string;
  farm_id: string;
  farm_name?: string | null;
  zone_id: string | null;
  zone_name?: string | null;
  device_type: string | null;
  model: string | null;
  status: "online" | "offline" | "warning";
  firmware_version: string | null;
  last_seen: string | null;
  archived_at: string | null;
  created_at: string;
};

const STATUS: Record<"online" | "offline" | "warning" | "never_connected", { label: string; cls: string; dot: string }> = {
  online: { label: "Online", cls: "bg-green-100 text-green-800", dot: "bg-green-500" },
  offline: { label: "Offline", cls: "bg-brand-100 text-brand-700/70", dot: "bg-brand-400" },
  warning: { label: "Warning", cls: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  never_connected: { label: "Never Connected", cls: "bg-brand-100 text-brand-700/60", dot: "bg-brand-300" },
};

export function DeviceCard({
  device,
  canRestore,
  showFarmLink = true,
}: {
  device: DeviceRow;
  canRestore: boolean;
  showFarmLink?: boolean;
}) {
  const isArchived = !!device.archived_at;
  const s = STATUS[computeDeviceStatus(device.status, device.last_seen)];
  return (
    <div className={`card p-5 sm:p-6 flex flex-col ${isArchived ? "opacity-75" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-brand-800 truncate">{device.device_name}</span>
          </div>
          <div className="font-mono text-xs text-brand-900/60 mt-0.5">{device.device_uid}</div>
        </div>
        {isArchived ? (
          <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-brand-100 text-brand-700/80">
            Archived
          </div>
        ) : (
          <div className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${s.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </div>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-brand-900/55">ฟาร์ม</dt>
          <dd className="font-semibold text-brand-800 truncate">
            {showFarmLink && device.farm_name ? (
              <Link href={`/dashboard/farms/${device.farm_id}`} className="hover:text-brand-600">
                {device.farm_name}
              </Link>
            ) : (
              device.farm_name ?? "-"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-brand-900/55">แปลง / Zone</dt>
          <dd className="font-semibold text-brand-800 truncate">{device.zone_name ?? "— ไม่ระบุ —"}</dd>
        </div>
        <div>
          <dt className="text-xs text-brand-900/55">Model</dt>
          <dd className="font-semibold text-brand-800">{device.model ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-brand-900/55">Firmware</dt>
          <dd className="font-mono text-xs text-brand-800">{device.firmware_version ?? "-"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-brand-900/55">Last Seen</dt>
          <dd className="font-semibold text-brand-800">
            {formatLastSeenRelative(device.last_seen)}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {!isArchived && (
          <>
            <Link
              href={`/dashboard/devices/${device.id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 transition"
            >
              เปิดอุปกรณ์
            </Link>
            <Link
              href={`/dashboard/devices/${device.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 text-xs font-semibold px-4 py-2 transition"
            >
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              แก้ไข
            </Link>
            <ArchiveDeviceButton deviceId={device.id} deviceLabel={device.device_uid} />
          </>
        )}
        {isArchived && (
          <RestoreDeviceButton
            deviceId={device.id}
            deviceLabel={device.device_uid}
            canRestore={canRestore}
          />
        )}
      </div>
    </div>
  );
}
