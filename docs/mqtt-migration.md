# MQTT Migration — HiveMQ Cloud → Self-hosted EMQX

Zero-downtime migration plan for existing SMF001 test unit + future devices onto `mqtt.bkknex.com`.

## Migration principles

1. **Parallel operation** — HiveMQ + EMQX both accept traffic during transition
2. **One device at a time** — migrate + verify before proceeding
3. **Rollback ready** — every step reversible until credential is deleted from HiveMQ
4. **SMF001 last** — it works today; touch it only after new EMQX proven with test unit

## Prerequisites

- EMQX deployment complete on VPS (see [self-hosted-mqtt.md](self-hosted-mqtt.md))
- DNS `mqtt.bkknex.com` resolves to VPS IPv4
- TLS cert valid
- `smf-bridge` superuser credential created in EMQX
- Railway bridge patched to subscribe both brokers (Phase 4.7.1 — see below)

## Phase 4.7.1 — Bridge multi-broker (required prerequisite)

Current bridge subscribes 1 broker. To migrate zero-downtime, needs 2 concurrent connections.

**bridge.js patch (add to smfiot-bridge repo):**

```javascript
// Add second env-based connection alongside existing client
const brokers = [
  { url: HIVEMQ_URL, user: HIVEMQ_USER, pass: HIVEMQ_PASS, label: "hivemq" },
];
if (process.env.HIVEMQ_URL_NEW) {
  brokers.push({
    url: process.env.HIVEMQ_URL_NEW,
    user: process.env.HIVEMQ_USER_NEW,
    pass: process.env.HIVEMQ_PASS_NEW,
    label: "emqx",
  });
}

for (const b of brokers) {
  const c = mqtt.connect(b.url, { username: b.user, password: b.pass, ... });
  c.on("connect", () => console.log(`[mqtt:${b.label}] connected`));
  c.on("message", (topic, payload) => handleMessage(topic, payload, b.label));
  // ... same subscribe + handler logic
}
```

Full patch = ~30 lines. Behavior:
- 2 clients connect concurrently
- Same `handleMessage` routes to same `/api/telemetry/ingest`
- Log tags each message with source broker for observability
- Either broker fails → other continues serving

## Per-device migration steps

**For a new device (never migrated before):**

1. **SMF Web:** create device → get `device_uid` (e.g. `SMF002`)
2. **EMQX Dashboard:** create credential username = `SMF002`, save plaintext once
3. **SMF Web:** insert credential hash (via server action `regenerateDeviceCredential`, or SQL if UI not wired to EMQX yet)
4. **ESP32 firmware:** update `secrets.h`:
   ```cpp
   #define MQTT_HOST     "mqtt.bkknex.com"
   #define MQTT_USER     "SMF002"
   #define MQTT_PASSWORD "<from EMQX>"
   ```
5. **Firmware:** rebuild + flash
6. **Verify:**
   - Serial: `[MQTT] connected to mqtt.bkknex.com`
   - EMQX Dashboard → Clients: shows `SMF002` online
   - Railway logs: `[mqtt:emqx] smf/CUS.../SMF002/telemetry {"temperature":...}`
   - Railway logs: `[ingest] {"ok":true,"inserted":2}`
   - SMF Web: device ONLINE + sensor values updating

**For SMF001 (currently on HiveMQ) — migrate last:**

1. Create EMQX credential username = `SMF001`
2. Optional: keep HiveMQ credential live temporarily as fallback
3. Update firmware `MQTT_HOST` + `MQTT_USER` + `MQTT_PASSWORD` + `MQTT_TOPIC_PREFIX`:
   - Legacy topic `farm/temp` → new `smf/{customer_id}/SMF001/telemetry` batch
   - OR: keep publishing `farm/temp` + configure ACL to allow both (transition)
4. Reflash SMF001
5. Verify on EMQX Dashboard → Clients
6. After 24h stable → delete HiveMQ credential + remove HiveMQ_URL from Railway env

## Firmware payload format change

**Legacy (5 separate publishes per cycle):**
```
farm/temp     {"temperature":28.4}
farm/humidity {"humidity":74.3}
farm/light    {"lux":532}
farm/soil     {"ph":6.5,...}
farm/power    {"v":230,...}
```

**New (1 batched publish):**
```
smf/{customer_id}/{device_uid}/telemetry
{
  "temperature":28.4,
  "humidity":74.3,
  "light":532,
  "soil_moisture":45,
  "ph":6.5,
  "ec":420,
  "voltage":230.5,
  "current":1.2,
  "power":276.6,
  "timestamp":"2026-08-19T15:03:11Z"
}
```

Reduces MQTT message count 5× → less broker load + fewer HMAC signatures.

Ingest already supports this (Phase 4.3 `handleMessage` for `parsed.kind === "telemetry"`).

## Rollback procedure

**Device fails to connect on EMQX:**
1. Firmware: revert `secrets.h` to HiveMQ values
2. Reflash
3. Device back on HiveMQ within 30s

**EMQX server issue (whole broker down):**
1. Devices already migrated: reflash to HiveMQ if HiveMQ credentials still valid
2. Long-term: fix EMQX or fall back to HiveMQ Starter tier temporarily

**Migration abandoned:**
1. Delete `HIVEMQ_URL_NEW` + related env from Railway
2. Bridge falls back to single HiveMQ connection (no code change needed if patch guards on env presence)
3. Delete EMQX credentials, keep HiveMQ credentials

## Success criteria

Migration complete when:
- ✅ All devices connect to `mqtt.bkknex.com`
- ✅ Zero devices on HiveMQ Cloud
- ✅ HiveMQ Cloud subscription cancelled
- ✅ Railway bridge subscribes EMQX only (single broker config)
- ✅ 7 days of stable operation on EMQX
- ✅ Cost saving realized (VPS ~$5-10/mo vs HiveMQ paid tier)

## Timeline estimate

Assuming 1 test device + SMF001:

| Step | Duration |
|---|---|
| Bridge multi-broker patch + deploy | 1 hour |
| Test device (SMF002) migration | 30 min |
| Observe 24h | 1 day |
| SMF001 migration | 30 min |
| Observe 7 days | 1 week |
| Delete HiveMQ credentials | 5 min |
| Update Railway env (remove old) | 5 min |
| **Total elapsed** | **~8 days (2 hours active work)** |

## Post-migration cleanup

1. Remove HiveMQ-specific env from Vercel/Railway
2. Update `docs/mqtt-architecture.md` — remove legacy paths
3. Rotate EMQX admin password
4. Enable EMQX built-in DB export cron backup
5. Test disaster recovery once (spin up VPS #2 + restore backup → verify device reconnects to new IP after DNS update)
