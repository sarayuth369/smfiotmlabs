import { requireModule } from "@/lib/admin/current";
import { getBridgeStatus, getLegacyBridgeStatus } from "@/lib/admin/mqtt-webhook";
import type { BridgeStatus } from "@/lib/admin/mqtt-webhook";
import { MqttSubnav } from "../_components/MqttSubnav";
import { RestartButton } from "./_components/RestartButton";

function BridgeCard({ bridge, readOnly }: { bridge: BridgeStatus; readOnly: boolean }) {
  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-brand-800">{bridge.name}</h2>
            {readOnly && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">
                Legacy / Rollback — Read-only
              </span>
            )}
          </div>
          {!bridge.found ? (
            <p className="text-sm text-red-700 mt-1">Container ไม่พบ (found=false)</p>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${bridge.running ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-sm font-semibold text-brand-800">{bridge.status}</span>
            </div>
          )}
        </div>
        {!readOnly && <RestartButton />}
      </div>

      {bridge.found && (
        <>
          <dl className="grid sm:grid-cols-4 gap-4 text-sm mb-4">
            <div>
              <dt className="text-xs text-brand-900/55">Started</dt>
              <dd className="font-semibold text-brand-800 mt-0.5">
                {bridge.started_at ? new Date(bridge.started_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-brand-900/55">Restart Count</dt>
              <dd className="font-semibold text-brand-800 mt-0.5">{bridge.restart_count ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-900/55">CPU</dt>
              <dd className="font-semibold text-brand-800 mt-0.5">{bridge.cpu_percent ?? "-"}%</dd>
            </div>
            <div>
              <dt className="text-xs text-brand-900/55">RAM</dt>
              <dd className="font-semibold text-brand-800 mt-0.5">{bridge.mem_mb ?? "-"} MB</dd>
            </div>
          </dl>

          {bridge.last_ingest_log && (
            <div className="mb-3">
              <div className="text-xs font-bold text-brand-900/60 uppercase tracking-wider mb-1.5">Last Ingest</div>
              <pre className="text-[11px] font-mono bg-brand-50/60 border border-brand-100 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all">
                {bridge.last_ingest_log}
              </pre>
            </div>
          )}

          {bridge.recent_errors && bridge.recent_errors.length > 0 && (
            <div>
              <div className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1.5">Recent Errors</div>
              <div className="space-y-1.5">
                {bridge.recent_errors.map((e, i) => (
                  <pre key={i} className="text-[11px] font-mono bg-red-50 border border-red-100 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all text-red-800">
                    {e}
                  </pre>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default async function MqttBridgePage() {
  await requireModule("mqtt");

  const [bridgeRes, legacyRes] = await Promise.all([getBridgeStatus(), getLegacyBridgeStatus()]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-800 mb-1">MQTT / Bridge</h1>
      <p className="text-sm text-brand-900/60 mb-4">Bridge container health + control</p>
      <MqttSubnav active="bridge" />

      <div className="space-y-5">
        {bridgeRes.ok ? (
          <BridgeCard bridge={bridgeRes.bridge} readOnly={false} />
        ) : (
          <div className="card p-4 border-red-200 bg-red-50 text-red-800 text-sm">
            ดึงสถานะ bridge-prod ไม่ได้: {bridgeRes.error}
          </div>
        )}

        <div>
          <h2 className="text-sm font-bold text-brand-900/60 uppercase tracking-wider mb-2">Legacy Bridges</h2>
          <div className="space-y-4">
            {legacyRes.ok ? (
              legacyRes.legacy.map((b) => <BridgeCard key={b.name} bridge={b} readOnly />)
            ) : (
              <div className="card p-4 border-red-200 bg-red-50 text-red-800 text-sm">
                ดึงสถานะ legacy bridges ไม่ได้: {legacyRes.error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
