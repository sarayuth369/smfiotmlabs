import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/payment";
import { CopyRow } from "./_components/CopyRow";
import { RegenerateButton } from "./_components/RegenerateButton";
import { OtaPanel } from "./_components/OtaPanel";

// Phase 6 broker — mqtt.bkknex.com self-hosted EMQX. Env override for staging.
const BROKER_HOST = process.env.NEXT_PUBLIC_MQTT_BROKER_HOST ?? "mqtt.bkknex.com";
const BROKER_PORT_TLS = parseInt(process.env.NEXT_PUBLIC_MQTT_BROKER_TLS_PORT ?? "8883", 10);
const BROKER_PORT_WS = parseInt(process.env.NEXT_PUBLIC_MQTT_BROKER_WS_PORT ?? "8084", 10);

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

  const { data: device } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, device_name, farm_id, firmware_version")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) notFound();

  const { data: farmCheck } = await supabase
    .from("farms")
    .select("id")
    .eq("id", device.farm_id as string)
    .eq("user_id", user!.id)
    .maybeSingle();
  if (!farmCheck) notFound();

  const { data: cred } = await supabase
    .from("device_credentials")
    .select("mqtt_username, mqtt_password_prefix, mqtt_password_last4, created_at, rotated_at, mqtt_topic_prefix")
    .eq("device_id", deviceId)
    .is("revoked_at", null)
    .maybeSingle();

  // customer_identity_id lives on profiles, not iot_nodes. Only needed as a
  // fallback when device_credentials.mqtt_topic_prefix is missing (legacy
  // rows before Phase 6.2 provisioning).
  const { data: profile } = await supabase
    .from("profiles")
    .select("customer_identity_id")
    .eq("id", user!.id)
    .maybeSingle();

  const deviceUid = device.device_uid as string;
  const customerUuid = (profile?.customer_identity_id as string | null) ?? "<customer-uuid-missing>";

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/devices/${deviceId}`} className="hover:text-brand-900">
          ← {device.device_name}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">MQTT / Firmware</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          ข้อมูลเชื่อมต่อ MQTT — <span className="font-mono">{deviceUid}</span>
        </p>
        <p className="text-xs text-brand-900/50 mt-1">
          บอร์ด ESP32 เสีย / เปลี่ยนบอร์ดใหม่? กด &quot;สร้าง Credential ใหม่&quot; ด้านล่าง แล้ว flash ต่อในหน้าเดียวกันได้เลย — ไม่ต้องสร้างอุปกรณ์ใหม่, NODE นี้ยังคงเดิมทุกอย่าง
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <OtaPanel deviceId={deviceId} currentFirmwareVersion={(device.firmware_version as string | null) ?? null} />

          <div className="card p-6 space-y-4">
            <h2 className="font-bold text-brand-800">Broker Connection</h2>
            <CopyRow label="Broker Host" value={BROKER_HOST} />
            <div className="grid sm:grid-cols-2 gap-4">
              <CopyRow label="TLS Port (MQTT)" value={String(BROKER_PORT_TLS)} />
              <CopyRow label="WebSocket Port" value={String(BROKER_PORT_WS)} />
            </div>
            <CopyRow label="Full URL (mqtt.js / PubSubClient)" value={`mqtts://${BROKER_HOST}:${BROKER_PORT_TLS}`} />
            <CopyRow label="Client ID" value={deviceUid} />
            <CopyRow label="Customer UUID" value={customerUuid} />
            <p className="text-xs text-brand-900/55 border-t border-border pt-3">
              TLS ใช้ Let&apos;s Encrypt ISRG Root X1. Client ID = device_uid (ฝัง firmware ที่ ProvisioningSlot ตอน Web USB flash). Customer UUID ใช้ตอนตั้งค่า Flutter app.
            </p>
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
                    เก็บเฉพาะ bcrypt hash — plaintext ดูไม่ได้อีก. หากลืม password ต้อง Regenerate ใหม่ + re-flash firmware
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
            <h2 className="font-bold text-brand-800">🔧 แอปเชื่อมต่อไม่ได้? เช็ค 4 ข้อนี้</h2>
            <ol className="space-y-3 text-sm text-brand-900/80">
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">1</span>
                <span>
                  <strong>Host ต้องไม่มี</strong> <code className="font-mono bg-brand-50 px-1 rounded">http://</code> หรือ <code className="font-mono bg-brand-50 px-1 rounded">/</code> นำหน้า — พิมพ์แค่ <code className="font-mono bg-brand-50 px-1 rounded">mqtt.bkknex.com</code>
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">2</span>
                <span>
                  <strong>Password ตรงกับล่าสุดไหม?</strong> — ทุกครั้งที่กด &quot;สร้าง Credential ใหม่&quot; ด้านบน password เปลี่ยนทันที ต้องอัปเดตทั้ง App และ reflash ESP32 ด้วย password ใหม่เดียวกัน
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">3</span>
                <span>
                  <strong>TLS ต้องเปิด</strong> เสมอ (Port 8883) — ปิด TLS แล้วใช้ port เดิมจะเชื่อมไม่ติด
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">4</span>
                <span>
                  <strong>ESP32 ไม่ online?</strong> เช็คว่า WiFi บ้าน/ที่ทำงานยังใช้ได้ และ ESP32 เสียบไฟอยู่ — ลองกดปุ่ม Reset บนบอร์ด
                </span>
              </li>
            </ol>
            <p className="text-xs text-brand-900/55 border-t border-border pt-3">
              ยังไม่หาย? Regenerate Credential ใหม่อีกครั้ง แล้ว Web USB flash ทันที (อย่าปิดหน้าก่อน flash เสร็จ)
            </p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="text-xs text-brand-900/55 mb-2">Device</div>
            <div className="font-mono text-sm text-brand-800 break-all">{deviceUid}</div>
            <div className="mt-2 text-sm text-brand-900/70">{device.device_name}</div>
          </div>

          <div className="card p-5">
            <div className="text-xs font-bold text-green-800 uppercase tracking-wider mb-2">
              ✓ Production Broker
            </div>
            <p className="text-xs text-brand-900/70">
              Self-hosted EMQX ที่ <code className="font-mono">mqtt.bkknex.com</code>. Provisioning + ACL ตั้งค่าอัตโนมัติตอน &quot;เพิ่มอุปกรณ์&quot; ไม่ต้อง manual config.
            </p>
          </div>

          <div className="card p-5">
            <div className="text-xs font-bold text-brand-900/60 uppercase tracking-wider mb-2">
              📱 Flutter App / ESP32
            </div>
            <p className="text-xs text-brand-900/70">
              <strong>ESP32</strong>: credentials ถูก patch เข้า firmware อัตโนมัติตอน Web USB flash — ไม่ต้อง config manual<br />
              <strong>Flutter App</strong>: Broker Host + TLS Port + Username + Password (จากด้านซ้าย) → Save → Connect
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
