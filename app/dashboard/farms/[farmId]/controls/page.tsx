import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan, getRelayUsage, formatLimit, usagePercent } from "@/lib/plan-limits";
import { getRelayState } from "./actions";
import { RelayToggle } from "./_components/RelayToggle";
import { AddRelayButton, DeleteRelayButton } from "./_components/RelayFormButtons";

type RelayRow = { id: string; channel: number; name: string; device_id: string };
type DeviceRow = { id: string; device_uid: string; device_name: string };

export default async function FarmControlsPage({
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

  const { data: deviceRows } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, device_name")
    .eq("farm_id", farmId)
    .is("archived_at", null)
    .order("device_name");
  const devices = (deviceRows ?? []) as DeviceRow[];
  const deviceIds = devices.map((d) => d.id);

  const { data: relayRows } = deviceIds.length
    ? await supabase
        .from("relays")
        .select("id, channel, name, device_id")
        .in("device_id", deviceIds)
        .is("archived_at", null)
        .order("channel")
    : { data: [] };
  const relays = (relayRows ?? []) as RelayRow[];

  const [userPlan, relayUsage] = await Promise.all([
    getUserPlan(supabase, user!.id),
    getRelayUsage(supabase, user!.id),
  ]);
  const relayLimitLabel = formatLimit(userPlan.limits.max_relays);
  const relayPct = usagePercent(relayUsage, userPlan.limits.max_relays);
  const atRelayLimit = userPlan.limits.max_relays !== null && relayUsage >= userPlan.limits.max_relays;
  // Channel numbers available per device are capped by the plan's relay
  // quota too — a Starter (max_relays=2) account never sees Channel 3/4 as
  // an option, even on a brand-new device, even though the hardware
  // physically supports 4. Hardware ceiling (4) wins when the plan is
  // unlimited (max_relays null).
  const maxChannel = userPlan.limits.max_relays === null ? 4 : Math.min(4, userPlan.limits.max_relays);

  // Best-effort: read each relay's last-reported actual state in parallel.
  // A device that's offline or has never toggled a channel just shows
  // "ยังไม่มีรายงานจากอุปกรณ์" — not an error.
  const states = await Promise.all(relays.map((r) => getRelayState(r.device_id, r.channel)));
  const stateByRelayId = new Map(relays.map((r, i) => [r.id, states[i]]));

  const relaysByDevice = new Map<string, RelayRow[]>();
  for (const r of relays) {
    const list = relaysByDevice.get(r.device_id) ?? [];
    list.push(r);
    relaysByDevice.set(r.device_id, list);
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/farms/${farmId}`} className="hover:text-brand-900">
          ← {farm.name}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">Controls</h1>
          <p className="mt-1 text-sm text-brand-900/60">
            ควบคุมรีเลย์ (เปิด/ปิด) ของทุกอุปกรณ์ในฟาร์ม &quot;{farm.name}&quot;
          </p>
        </div>
        <div className="card px-4 py-2.5 text-right">
          <div className="text-xs text-brand-900/55">โควตา Relay (บัญชี)</div>
          <div className="text-lg font-bold text-brand-800">
            {relayUsage.toLocaleString()} / {relayLimitLabel}
          </div>
          {userPlan.limits.max_relays !== null && (
            <div className="mt-1 h-1.5 w-32 rounded-full bg-brand-100 overflow-hidden ml-auto">
              <div
                className={`h-full ${atRelayLimit ? "bg-red-500" : "bg-brand-600"}`}
                style={{ width: `${relayPct}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {atRelayLimit && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          คุณใช้จำนวน Relay ครบตามแพ็กเกจแล้ว ({relayUsage}/{relayLimitLabel}) — ลบ Relay ที่ไม่ใช้ หรืออัปเกรดแพ็กเกจก่อนเพิ่มใหม่
        </div>
      )}

      {devices.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl">⚡</div>
          <div className="mt-3 font-semibold text-brand-800">ฟาร์มนี้ยังไม่มีอุปกรณ์ IoT</div>
          <p className="mt-1 text-sm text-brand-900/60">ต้องมีอุปกรณ์อย่างน้อย 1 ตัวก่อน ถึงจะเพิ่ม Relay ได้</p>
          <Link
            href={`/dashboard/devices/new?farm_id=${farmId}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition"
          >
            + เพิ่มอุปกรณ์
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {devices.map((device) => {
            const deviceRelays = relaysByDevice.get(device.id) ?? [];
            const usedChannels = deviceRelays.map((r) => r.channel);
            return (
              <div key={device.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="font-bold text-brand-800">{device.device_name}</div>
                    <div className="font-mono text-xs text-brand-900/55">{device.device_uid}</div>
                  </div>
                  <AddRelayButton
                    deviceId={device.id}
                    usedChannels={usedChannels}
                    maxChannel={maxChannel}
                    disabled={atRelayLimit || usedChannels.length >= maxChannel}
                  />
                </div>

                {deviceRelays.length === 0 ? (
                  <p className="text-sm text-brand-900/50">ยังไม่มี Relay ในอุปกรณ์นี้</p>
                ) : (
                  <div className="divide-y divide-brand-100">
                    {deviceRelays.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="font-semibold text-brand-800 truncate">{r.name}</div>
                          <div className="text-xs text-brand-900/55">Channel {r.channel}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <RelayToggle deviceId={device.id} channel={r.channel} initialState={stateByRelayId.get(r.id) ?? null} />
                          <DeleteRelayButton deviceId={device.id} relayId={r.id} relayName={r.name} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
