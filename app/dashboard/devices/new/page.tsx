import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canCreateNode } from "@/lib/plan-limits";
import { DeviceForm } from "../_components/DeviceForm";
import { PlanLimitNotice } from "../../farms/_components/PlanLimitNotice";
import { createDevice } from "../actions";

export default async function NewDevicePage({
  searchParams,
}: {
  searchParams: Promise<{ farm_id?: string; zone_id?: string }>;
}) {
  const sp = await searchParams;
  const preFarm = sp.farm_id;
  const preZone = sp.zone_id;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: farms }, check] = await Promise.all([
    supabase
      .from("farms")
      .select("id, name")
      .eq("user_id", user!.id)
      .is("archived_at", null)
      .order("name"),
    canCreateNode(supabase, user!.id),
  ]);
  const farmList = (farms ?? []).map((f) => ({ id: f.id as string, name: f.name as string }));
  const farmIds = farmList.map((f) => f.id);

  const { data: zonesData } = farmIds.length
    ? await supabase
        .from("zones")
        .select("id, name, farm_id")
        .in("farm_id", farmIds)
        .is("archived_at", null)
        .order("name")
    : { data: [] as { id: string; name: string; farm_id: string }[] };
  const zoneList = (zonesData ?? []).map((z) => ({
    id: z.id as string,
    name: z.name as string,
    farm_id: z.farm_id as string,
  }));

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard/devices" className="hover:text-brand-900">← อุปกรณ์ IoT</Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">เพิ่มอุปกรณ์ IoT</h1>
      <p className="text-sm text-brand-900/60 mt-1">ลงทะเบียน SMF IoT Node ใหม่</p>

      <div className="mt-6">
        {!check.ok ? (
          <div className="space-y-4">
            <PlanLimitNotice
              planName={check.planName}
              current={check.current}
              limit={check.limit ?? 0}
              entity="อุปกรณ์"
            />
            <div className="flex justify-end">
              <Link
                href="/dashboard/devices"
                className="rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-5 py-2.5 text-sm transition"
              >
                กลับไปรายการอุปกรณ์
              </Link>
            </div>
          </div>
        ) : farmList.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="text-4xl">🌱</div>
            <div className="mt-3 font-bold text-brand-800">คุณยังไม่มีฟาร์ม</div>
            <p className="mt-1 text-sm text-brand-900/60">
              สร้างฟาร์มก่อน แล้วจึงลงทะเบียนอุปกรณ์
            </p>
            <Link
              href="/dashboard/farms/new"
              className="mt-5 inline-flex rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
            >
              + เพิ่มฟาร์ม
            </Link>
          </div>
        ) : (
          <DeviceForm
            action={createDevice}
            farms={farmList}
            zones={zoneList}
            submitLabel="ลงทะเบียนอุปกรณ์"
            cancelHref="/dashboard/devices"
            initial={{ farm_id: preFarm, zone_id: preZone ?? null }}
          />
        )}
      </div>
    </div>
  );
}
