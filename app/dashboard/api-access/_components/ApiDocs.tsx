const ENDPOINTS = [
  { method: "GET", path: "/api/v1/devices", desc: "รายชื่ออุปกรณ์ทั้งหมด (ตาม scope ของ key)", perm: "READ_DEVICES" },
  { method: "GET", path: "/api/v1/devices/:deviceId", desc: "รายละเอียดอุปกรณ์เดียว", perm: "READ_DEVICES" },
  { method: "GET", path: "/api/v1/devices/:deviceId/status", desc: "สถานะออนไลน์/ออฟไลน์", perm: "READ_STATUS" },
  { method: "GET", path: "/api/v1/devices/:deviceId/sensors", desc: "รายชื่อ Sensor ของอุปกรณ์", perm: "READ_SENSORS" },
  { method: "GET", path: "/api/v1/devices/:deviceId/readings", desc: "ประวัติค่า Sensor (?sensor_id, ?since, ?limit)", perm: "READ_READINGS" },
  { method: "GET", path: "/api/v1/readings", desc: "ค่าล่าสุดของทุก Sensor ในบัญชี (?device_id)", perm: "READ_READINGS" },
  { method: "POST", path: "/api/v1/devices/:deviceId/control", desc: "สั่งเปิด/ปิด Relay — Business/Premium เท่านั้น", perm: "CONTROL_DEVICES" },
];

export function ApiDocs({ baseUrl }: { baseUrl: string }) {
  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="font-bold text-brand-800">Documentation</h2>
        <p className="text-xs text-brand-900/50 mt-0.5">ทุก request ต้องแนบ header Authorization</p>
      </div>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-brand-900/60 mb-2">Authentication</div>
        <pre className="rounded-lg bg-brand-900 text-white text-xs p-3 overflow-x-auto font-mono">
{`curl \\
  -H "Authorization: Bearer <API_KEY>" \\
  ${baseUrl}/api/v1/devices`}
        </pre>
      </div>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-brand-900/60 mb-2">Endpoints</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-brand-900/50 border-b border-border">
                <th className="py-1.5 pr-3 font-semibold">Method</th>
                <th className="py-1.5 pr-3 font-semibold">Path</th>
                <th className="py-1.5 pr-3 font-semibold">Permission</th>
                <th className="py-1.5 font-semibold">คำอธิบาย</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.path + e.method} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-3">
                    <span className={`font-mono font-bold ${e.method === "POST" ? "text-amber-700" : "text-brand-700"}`}>{e.method}</span>
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-brand-800">{e.path}</td>
                  <td className="py-1.5 pr-3 font-mono text-brand-900/60">{e.perm}</td>
                  <td className="py-1.5 text-brand-900/70">{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-brand-900/60 mb-2">Example Response</div>
        <pre className="rounded-lg bg-brand-50 border border-border text-xs p-3 overflow-x-auto font-mono text-brand-900">
{`{
  "devices": [
    { "id": "...", "device_uid": "SMF-221E35", "device_name": "NODE11",
      "status": "online", "last_seen": "2026-08-26T10:00:00Z" }
  ]
}`}
        </pre>
      </div>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-brand-900/60 mb-2">Error Codes</div>
        <ul className="text-xs text-brand-900/70 space-y-1">
          <li><code className="font-mono">401</code> — API key ไม่ถูกต้อง / ถูก revoke</li>
          <li><code className="font-mono">403</code> — แพ็กเกจไม่รองรับ หรือ key ไม่มี permission นี้</li>
          <li><code className="font-mono">404</code> — ไม่พบอุปกรณ์ หรืออยู่นอก scope ของ key</li>
          <li><code className="font-mono">429</code> — เกิน rate limit ของแพ็กเกจ — ดู header <code className="font-mono">retry-after</code></li>
        </ul>
      </div>
    </div>
  );
}
