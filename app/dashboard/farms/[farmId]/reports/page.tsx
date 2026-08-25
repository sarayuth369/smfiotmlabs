import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReportOverview, getReportSensorOptions } from "./actions";
import { formatLastSeenRelative } from "@/lib/device-status";
import { ReportsClient } from "./_components/ReportsClient";

export default async function FarmReportsPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: farm } = await supabase
    .from("farms")
    .select("id, name")
    .eq("id", farmId)
    .eq("user_id", user!.id)
    .maybeSingle();
  if (!farm) notFound();

  const [overview, sensors] = await Promise.all([
    getReportOverview(farmId),
    getReportSensorOptions(farmId),
  ]);

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/farms/${farmId}`} className="hover:text-brand-900">
          ← {farm.name}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">รายงาน</h1>
        <p className="mt-1 text-sm text-brand-900/60">ภาพรวมและแนวโน้มข้อมูล Sensor ของฟาร์ม &quot;{farm.name}&quot;</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <OverviewCard label="อุปกรณ์" value={overview.deviceCount} />
        <OverviewCard
          label="สถานะ"
          value={`${overview.onlineCount} online`}
          sub={`${overview.offlineCount} offline`}
        />
        <OverviewCard
          label="Sensor บันทึกประวัติ"
          value={`${overview.sensorsRecording}/${overview.sensorsTotal}`}
        />
        <OverviewCard
          label="บันทึกล่าสุด"
          value={formatLastSeenRelative(overview.lastRecordedAt)}
        />
      </div>

      <ReportsClient farmId={farmId} sensors={sensors} />
    </div>
  );
}

function OverviewCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-brand-900/55">{label}</div>
      <div className="mt-1 text-lg font-bold text-brand-800">{value}</div>
      {sub && <div className="text-xs text-brand-900/45">{sub}</div>}
    </div>
  );
}
