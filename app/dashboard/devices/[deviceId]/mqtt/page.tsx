import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/payment";
import { CopyRow } from "./_components/CopyRow";
import { RegenerateButton } from "./_components/RegenerateButton";

// Broker config — env-driven so migration HiveMQ → self-hosted EMQX = 1 env change, no code change
const HIVEMQ_HOST =
  process.env.NEXT_PUBLIC_MQTT_BROKER_HOST ??
  "c3a0a4b369d142129741b4e3178a06f7.s1.eu.hivemq.cloud";
const HIVEMQ_PORT_TLS = parseInt(process.env.NEXT_PUBLIC_MQTT_BROKER_TLS_PORT ?? "8883", 10);
const HIVEMQ_PORT_WS = parseInt(process.env.NEXT_PUBLIC_MQTT_BROKER_WS_PORT ?? "8084", 10);

export default async function DeviceMqttPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS enforces ownership
  const { data: device } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, device_name, mqtt_client_id, farm_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) notFound();

  // Extra ownership check
  const { data: farmCheck } = await supabase
    .from("farms")
    .select("id")
    .eq("id", device.farm_id as string)
    .eq("user_id", user!.id)
    .maybeSingle();
  if (!farmCheck) notFound();

  // Read credential metadata (never returns hash)
  const { data: cred } = await supabase
    .from("device_credentials")
    .select("mqtt_username, mqtt_password_prefix, mqtt_password_last4, created_at, rotated_at")
    .eq("device_id", deviceId)
    .is("revoked_at", null)
    .maybeSingle();

  // Legacy topic prefix (if mapping exists)
  const { data: legacy } = await supabase
    .from("legacy_device_mappings")
    .select("legacy_topic_prefix")
    .eq("device_id", deviceId)
    .maybeSingle();
  const topicPrefix = (legacy?.legacy_topic_prefix as string | undefined) ?? "farm";

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/devices/${deviceId}`} className="hover:text-brand-900">
          ← {device.device_name}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">MQTT Configuration</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          ข้อมูลเชื่อมต่อ MQTT สำหรับ ESP32 / Flutter App — <span className="font-mono">{device.device_uid}</span>
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6 space-y-4">
            <h2 className="font-bold text-brand-800">Broker Connection</h2>
            <CopyRow label="Broker Host" value={HIVEMQ_HOST} />
            <div className="grid sm:grid-cols-2 gap-4">
              <CopyRow label="TLS Port (MQTT)" value={String(HIVEMQ_PORT_TLS)} />
              <CopyRow label="WebSocket Port" value={String(HIVEMQ_PORT_WS)} />
            </div>
            <CopyRow label="Full URL (mqtt.js / PubSubClient)" value={`mqtts://${HIVEMQ_HOST}:${HIVEMQ_PORT_TLS}`} />
            <CopyRow label="Client ID" value={(device.mqtt_client_id as string) ?? `smf_device_${device.device_uid}`} />
          </div>

          <div className="card p-6 space-y-4">
            <h2 className="font-bold text-brand-800">Credential</h2>
            {cred ? (
              <>
                <CopyRow label="Username" value={cred.mqtt_username as string} />
                <div>
                  <div className="text-xs font-semibold text-brand-900/60 mb-1">Password</div>
                  <div className="font-mono text-sm bg-brand-50/60 border border-brand-100 rounded-lg px-3 py-2 text-brand-900/60">
                    {(cred.mqtt_password_prefix as string) ?? "••••"}
                    ••••••••••••••••••••••••
                    {(cred.mqtt_password_last4 as string) ?? ""}
                  </div>
                  <p className="mt-1 text-xs text-brand-900/50">
                    เก็บเฉพาะ hash — plaintext ดูไม่ได้อีก. หากลืม password ต้อง Regenerate ใหม่
                  </p>
                </div>
                <div className="text-xs text-brand-900/55 border-t border-border pt-3">
                  สร้างเมื่อ {formatThaiDate(cred.created_at as string)}
                  {cred.rotated_at && ` — อัปเดตล่าสุด ${formatThaiDate(cred.rotated_at as string)}`}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-brand-200 p-6 text-center">
                <div className="text-3xl">🔐</div>
                <div className="mt-2 font-semibold text-brand-800">ยังไม่มี MQTT Credential</div>
                <p className="mt-1 text-sm text-brand-900/60">
                  กดปุ่มด้านล่างเพื่อสร้าง — password จะแสดงครั้งเดียวเท่านั้น
                </p>
              </div>
            )}
            <RegenerateButton deviceId={deviceId} />
          </div>

          <div className="card p-6 space-y-4">
            <h2 className="font-bold text-brand-800">MQTT Topics</h2>
            <p className="text-xs text-brand-900/60">
              Topic ที่ device นี้ publish/subscribe ผ่าน broker
            </p>
            <div className="space-y-2">
              <CopyRow label="Telemetry (publish)" value={`${topicPrefix}/temp`} />
              <CopyRow label="Humidity (publish)" value={`${topicPrefix}/humidity`} />
              <CopyRow label="Status (publish)" value={`${topicPrefix}/device/status`} />
              <CopyRow label="Relay set (subscribe)" value={`${topicPrefix}/relay/+/set`} />
              <CopyRow label="Relay status (publish)" value={`${topicPrefix}/relay/+/status`} />
            </div>
            <p className="text-xs text-brand-900/55 border-t border-border pt-3">
              Legacy prefix: <code className="font-mono">{topicPrefix}</code>. Multi-device production ต้องเปลี่ยน firmware ให้ใส่ device-scoped prefix — <Link href="/docs/esp32-mqtt-integration-spec.md" className="underline">ดู spec</Link>
            </p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="text-xs text-brand-900/55 mb-2">Device</div>
            <div className="font-mono text-sm text-brand-800 break-all">{device.device_uid}</div>
            <div className="mt-2 text-sm text-brand-900/70">{device.device_name}</div>
          </div>

          <div className="card p-5">
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">
              ⚠ Free HiveMQ Tier
            </div>
            <p className="text-xs text-brand-900/70">
              ต้องสร้าง credential ที่ HiveMQ Dashboard ด้วยตัวเอง (ด้วย username/password ที่แสดงหลัง Regenerate). Broker ไม่รู้จัก username นี้จนกว่าจะเพิ่มที่ Dashboard.
            </p>
            <p className="mt-2 text-xs text-brand-900/70">
              Upgrade Starter tier ($65/mo) = automated provisioning + per-device ACL
            </p>
          </div>

          <div className="card p-5">
            <div className="text-xs font-bold text-brand-900/60 uppercase tracking-wider mb-2">
              📱 Flutter App
            </div>
            <p className="text-xs text-brand-900/70">
              เปิด Flutter App → Settings → Broker → กรอกค่า Broker Host + Port + Username + Password จากด้านซ้าย → Save → Connect
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
