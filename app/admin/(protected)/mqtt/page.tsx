import { requireModule } from "@/lib/admin/current";
import { getBrokerStats, getBridgeStatus, listMqttUsers } from "@/lib/admin/mqtt-webhook";
import { MqttSubnav } from "./_components/MqttSubnav";

function fmtUptime(ms: number | null): string {
  if (ms === null) return "-";
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default async function MqttOverviewPage() {
  await requireModule("mqtt");

  const [statsRes, bridgeRes, usersRes] = await Promise.all([
    getBrokerStats(),
    getBridgeStatus(),
    listMqttUsers(),
  ]);

  const stats = statsRes.ok ? statsRes.stats : null;
  const bridge = bridgeRes.ok ? bridgeRes.bridge : null;
  const users = usersRes.ok ? usersRes.users : [];
  const onlineCount = users.filter((u) => u.connected_clients > 0).length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-800 mb-1">MQTT / Bridge</h1>
      <p className="text-sm text-brand-900/60 mb-4">
        บริหาร mqtt.bkknex.com (EMQX) + smf-mqtt-bridge-prod
      </p>
      <MqttSubnav active="overview" />

      {!statsRes.ok && (
        <div className="card p-4 mb-5 border-red-200 bg-red-50 text-red-800 text-sm">
          ดึงข้อมูล broker ไม่ได้: {statsRes.ok === false ? statsRes.error : ""}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5">
          <div className="text-xs text-brand-900/55">Broker Status</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${stats?.node_status === "running" ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-lg font-bold text-brand-800">{stats?.node_status ?? "unknown"}</span>
          </div>
          <div className="text-xs text-brand-900/50 mt-1">
            EMQX {stats?.version ?? "-"} · uptime {fmtUptime(stats?.uptime_ms ?? null)}
          </div>
        </div>

        <div className="card p-5">
          <div className="text-xs text-brand-900/55">Connected Devices</div>
          <div className="text-2xl font-bold text-brand-800 mt-1">
            {stats?.connections ?? "-"}
          </div>
          <div className="text-xs text-brand-900/50 mt-1">
            {onlineCount} / {users.length} MQTT users online
          </div>
        </div>

        <div className="card p-5">
          <div className="text-xs text-brand-900/55">Messages (cumulative)</div>
          <div className="text-sm font-semibold text-brand-800 mt-1">
            {(stats?.messages_received ?? 0).toLocaleString()} recv / {(stats?.messages_sent ?? 0).toLocaleString()} sent
          </div>
          <div className="text-xs text-brand-900/50 mt-1">
            {(stats?.messages_dropped ?? 0).toLocaleString()} dropped since broker start
          </div>
        </div>

        <div className="card p-5">
          <div className="text-xs text-brand-900/55">Bridge (smf-mqtt-bridge-prod)</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${bridge?.running ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-lg font-bold text-brand-800">{bridge?.running ? "running" : bridge?.status ?? "unknown"}</span>
          </div>
          <div className="text-xs text-brand-900/50 mt-1">
            CPU {bridge?.cpu_percent ?? "-"}% · RAM {bridge?.mem_mb ?? "-"} MB
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-bold text-brand-800 mb-3">Last Successful Ingest</h2>
        {bridge?.last_ingest_log ? (
          <pre className="text-xs font-mono bg-brand-50/60 border border-brand-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
            {bridge.last_ingest_log}
          </pre>
        ) : (
          <p className="text-sm text-brand-900/50">ไม่มีข้อมูล ingest ล่าสุด</p>
        )}
        {bridge?.recent_errors && bridge.recent_errors.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-bold text-red-700 uppercase tracking-wider mb-2">Recent Errors</div>
            <div className="space-y-1">
              {bridge.recent_errors.map((e, i) => (
                <pre key={i} className="text-xs font-mono bg-red-50 border border-red-100 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all text-red-800">
                  {e}
                </pre>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
