# SMF IoT — Device Provisioning Runbook

Step-by-step for admin/user to onboard a new ESP32 device end-to-end.

## Prerequisites

- SMF Web deployed on Vercel (env `TELEMETRY_INGEST_SECRET` set)
- HiveMQ Cloud cluster active (Free or Starter)
- Railway Bridge running with matching `HIVEMQ_USER` + `HIVEMQ_PASS` + `TELEMETRY_INGEST_SECRET`
- Supabase Section 18 + 21 + 22 SQL run
- ESP32 firmware ready to flash

## Onboarding flow (per device)

### 1. User creates device in Web

1. Login → Dashboard → เพิ่มฟาร์ม (if none)
2. Farm → เพิ่มอุปกรณ์ → give name
3. Get `device_uid` (e.g. `SMF001`) — visible in device Overview

**Plan limit auto-enforced** via `canCreateNode()`. Limit hit = block + "อัปเกรดแพ็กเกจ"

### 2. Add sensors to device

- Sensors tab → เพิ่ม Sensor
- Type: `temperature` / `humidity` / etc.
- **Channel: เว้นว่าง** (unless multi-channel probe)
- Unit: auto-suggested

### 3. Register topic mapping (SQL — legacy only)

Only needed if firmware uses legacy `farm/*` topics:
```sql
insert into public.legacy_device_mappings (device_id, legacy_topic_prefix, notes)
values (
  (select id from public.iot_nodes where device_uid = 'SMF001'),
  'farm',                              -- Option B single-tenant test
  'ESP32 test unit'
);
```

Skip this step for devices using new `smf/{customer}/{uid}/*` topics.

### 4. Generate MQTT credential

Device detail → **MQTT tab** → คลิก **สร้าง Credential ใหม่**

Result:
- Yellow box shows **username + password** ONCE
- **Copy password to Notepad** — cannot view again
- SMF stores bcrypt hash only

### 5a. Manual mode (HiveMQ Free)

**Admin does this in HiveMQ Dashboard:**
1. HiveMQ Cloud → cluster → Access Management
2. Create Credential:
   - Username: paste from Step 4
   - Password: paste from Step 4 (plaintext)
   - Permissions: publish+subscribe `farm/#` (legacy) or `smf/{cust}/{uid}/#` (new)
3. Save

### 5b. Automatic mode (HiveMQ Starter+, future)

Nothing manual — SMF backend calls HiveMQ REST API on Step 4. Credential + ACL live immediately.

### 6. Flash ESP32 firmware

Edit `firmware/main_board/include/secrets.h` (gitignored):
```cpp
#pragma once
#define MQTT_USER     "<username_from_step_4>"
#define MQTT_PASSWORD "<password_from_step_4>"
```

PlatformIO → Upload

### 7. Verify

- ESP32 serial log: `MQTT connected`
- HiveMQ Dashboard → Clients: new client visible
- Railway Bridge logs:
  ```
  [mqtt] farm/temp {"temperature":28.5}
  [ingest] {"ok":true,"device_uid":"SMF001","inserted":1}
  ```
- SMF Web device detail: **OFFLINE → ONLINE**, sensor values populate within 5s poll

## Rotation flow

**Trigger:** credential leaked, employee turnover, scheduled rotation

1. Device detail → MQTT tab → **สร้าง Credential ใหม่**
2. Confirmation dialog → OK
3. Old credential auto-revoked (partial UNIQUE index enforces one active)
4. New username+password shown ONCE — copy
5. Manual mode: update HiveMQ Dashboard credential with new values (**or delete old + create new**)
6. Update `secrets.h` + reflash ESP32
7. Bridge Railway env: update `HIVEMQ_USER` + `HIVEMQ_PASS` (if bridge uses this device's credential — typically NO, bridge has separate worker credential)

**⚠ Downtime:** device disconnected between HiveMQ credential swap + ESP32 reflash. Plan window during off-hours.

## Revoke flow

**Trigger:** device stolen, no longer owned

1. Admin → SQL:
   ```sql
   update public.device_credentials
     set revoked_at = now()
     where device_id = (select id from public.iot_nodes where device_uid = 'SMF001');
   update public.iot_nodes set is_disabled = true where device_uid = 'SMF001';
   ```
2. HiveMQ Dashboard → delete credential
3. Device cannot reconnect

## Claim code flow (factory pre-provisioning)

For volume production where devices ship before user account exists:

1. Admin creates devices in bulk + generates claim codes:
   ```sql
   -- example bulk generator (adapt to your needs)
   insert into public.iot_nodes (device_uid, device_name, farm_id, status)
   values ('SMF042', 'Factory unit', '<placeholder-farm>', 'never_connected')
   returning id;
   insert into public.device_claim_codes (code, device_id)
   values ('SMF-XXXX-YYYY-ZZZZ', '<returned-id>');
   ```
2. Print `code` on device sticker (or QR)
3. Customer scans/types code → SMF Web claim page → RPC `claim_device_by_code(code, farm_id, zone_id)` transfers device to their farm

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Not authorized` in ESP32 log | HiveMQ credential mismatch (secrets.h vs Dashboard) | Rebuild firmware or fix HiveMQ user |
| `unknown sensor` in ingest log | Sensor type/channel doesn't match Web-registered sensor | Match `channel` (usually NULL) in Web |
| `unknown device` | No `legacy_device_mappings` row (for legacy) or wrong `device_uid` | Insert mapping / verify UID |
| Web shows OFFLINE while ESP32 publishes | `last_seen` > 60s old | ESP32 not publishing status heartbeat — check firmware |
| Values not updating in Web after 5s | Bridge crashed | Railway logs → restart |
