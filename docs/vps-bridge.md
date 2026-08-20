# VPS Bridge (Phase 4.8)

MQTT Bridge co-located with EMQX on the same VPS. Replaces (eventually) Railway bridge in the SMF IoT ingest path.

## Why co-locate

| Aspect | Railway (current) | VPS (Phase 4.8) |
|---|---|---|
| MQTT hop to broker | TLS 8883 over Internet | plain 1883 over Docker network |
| Latency (bridge ↔ broker) | 50-200 ms | <1 ms |
| Failure independence | 2 clouds (Railway + HiveMQ) | 1 VPS (correlated risk) |
| Cost | Railway $5/mo credit | included in VPS $5-10/mo |
| Complexity | separate repo + deploy | 1 docker-compose stack |

**Trade-off:** correlated failure risk (VPS down = broker AND bridge down) vs simpler ops + zero TLS overhead broker↔bridge.

**Mitigation:** keep Railway bridge running during migration → belt+suspenders. Only stop Railway after 7+ days of stable VPS operation.

## Architecture

```
                Public Internet
                       ↓
┌──────────────────────────────────────────────────┐
│  VPS (Ubuntu, Docker Compose)                    │
│                                                  │
│  ┌──────────────────────┐                       │
│  │ EMQX 5.7             │                       │
│  │  :8883 mqtts (public)│  ← ESP32               │
│  │  :8084 wss   (public)│  ← Browser/Flutter Web │
│  │  :1883 mqtt (internal)                       │
│  │  :18083 dashboard    │                       │
│  └────────┬─────────────┘                       │
│           │ (docker network: mqttnet)           │
│  ┌────────┴─────────────┐                       │
│  │ smf-bridge (Node 20) │                       │
│  │  subscribes emqx:1883│                       │
│  │  farm/# + smf/+/+/+  │                       │
│  └────────┬─────────────┘                       │
│           │ HTTPS + HMAC                        │
└───────────┼──────────────────────────────────────┘
            ↓
     Vercel /api/telemetry/ingest
            ↓
        Supabase
```

## Files in kit

`D:\Websites\smfiot-mqtt\` — full VPS deployment kit:
```
├── docker-compose.yml           # EMQX + smf-bridge + certbot
├── .env.example                  # secrets template (fill + rename to .env)
├── .gitignore                    # protects .env + certs + backups
├── README.md                     # deployment steps
├── emqx/etc/acl.conf             # deny-by-default ACL rules
├── bridge/
│   ├── Dockerfile                # Alpine + Node 20, non-root user
│   ├── package.json              # mqtt lib
│   └── bridge.js                 # same logic as Railway bridge
├── scripts/
│   ├── init-tls.sh               # Let's Encrypt one-time issuance
│   ├── backup.sh                 # daily EMQX + config backup
│   └── monitor.sh                # health check (docker/emqx/bridge/cert/disk/mem)
├── test-client.js                # verify auth + ACL isolation
└── certs/                        # Let's Encrypt certificates (gitignored)
```

## Duplicate protection (during migration)

**Risk:** if a device somehow publishes to BOTH HiveMQ AND EMQX simultaneously, both bridges POST to `/api/telemetry/ingest` → duplicate rows.

**Mitigation (already in place):**
1. `sensor_readings_msg_uniq` partial UNIQUE `(sensor_id, message_id) WHERE message_id IS NOT NULL` (Section 18.3)
2. Bridge generates `message_id: crypto.randomUUID()` per POST — but 2 bridges = 2 different UUIDs on identical readings
3. **Real defense:** only ONE broker configured per device at a time. Firmware `secrets.h` = single `MQTT_HOST`.

**During migration:** device switches from HiveMQ to EMQX in one reflash. Never simultaneous. Small `last_seen` blip acceptable.

## Deployment

Full steps in `smfiot-mqtt/README.md`. Quick overview:

```bash
# On VPS
git clone <smfiot-mqtt repo> /opt/smfiot-mqtt
cd /opt/smfiot-mqtt
cp .env.example .env
nano .env                          # fill EMQX_NODE_COOKIE, BRIDGE_MQTT_PASS, INGEST_SECRET, etc.
chmod +x scripts/*.sh
./scripts/init-tls.sh              # issue Let's Encrypt cert
docker compose up -d               # start EMQX + bridge + certbot
docker compose logs -f             # verify both healthy
```

**Then in EMQX Dashboard** (via SSH tunnel):
1. Create `smf-bridge` superuser credential
2. Update `.env` `BRIDGE_MQTT_PASS` with matching password
3. `docker compose restart smf-bridge`
4. Verify bridge logs show `[mqtt] connected to mqtt://emqx:1883`

## Test device provisioning

Do NOT touch SMF001. Create TEST device:

**SMF Web:**
1. Add IoT Node → `SMF-TEST-VPS-01` (any device_uid)
2. Add sensors (temperature + humidity, channel null)
3. Legacy mapping — SKIP (VPS bridge uses new namespace directly)

**Supabase SQL:**
```sql
-- no changes needed — device_uid resolves via iot_nodes as-is
```

**EMQX Dashboard:**
- Create user `SMF-TEST-VPS-01` with random password
- ACL auto-applies via `acl.conf` (username-based rule)

**ESP32 test firmware `secrets.h`:**
```cpp
#define MQTT_HOST     "mqtt.bkknex.com"
#define MQTT_PORT     8883
#define MQTT_USER     "SMF-TEST-VPS-01"
#define MQTT_PASSWORD "<from EMQX dashboard>"
```

**Firmware code (change once, applies to all test devices):**
Change topic publish from `farm/temp` to:
```cpp
String topic = "smf/" + String(CUSTOMER_ID) + "/" + String(DEVICE_UID) + "/telemetry";
mqtt.publish(topic.c_str(), payload_batch);  // batched JSON
```

## Environment variables

**Vercel (SMF Web):**
- `NEXT_PUBLIC_MQTT_BROKER_HOST=mqtt.bkknex.com`  ← new (Phase 4.8)
- `NEXT_PUBLIC_MQTT_BROKER_TLS_PORT=8883`         ← new
- `NEXT_PUBLIC_MQTT_BROKER_WS_PORT=8084`          ← new
- `TELEMETRY_INGEST_SECRET=<same as VPS INGEST_SECRET>`

**VPS (.env):**
See `.env.example` — all documented.

**Railway (existing bridge):**
Unchanged — keeps HiveMQ path alive during migration.

## Rollback

If VPS EMQX fails:
1. Devices on VPS EMQX go offline
2. Reflash affected devices back to HiveMQ credential
3. Railway bridge already subscribed HiveMQ — telemetry resumes
4. Debug VPS side, fix, re-migrate

If VPS Bridge fails but EMQX OK:
1. `docker compose restart smf-bridge`
2. If persistent bug: shell into container, tail logs
3. Worst case: pull Railway bridge to also subscribe VPS EMQX broker temporarily (dual-broker mode)

## Monitoring

**Basic (included):**
- `scripts/monitor.sh` — cron every 10 min → exits 1 on warning
- Pipe to `mail`, Slack webhook, or Pushover

**Advanced (Phase 4.9 candidate):**
- Uptime Robot TCP check `mqtt.bkknex.com:8883` (free tier)
- Prometheus scrape EMQX `/api/v5/prometheus`
- Grafana dashboard

## Backup

**Local (nightly cron):**
```
0 3 * * * /opt/smfiot-mqtt/scripts/backup.sh >> /var/log/smf-backup.log 2>&1
```

**Offsite (recommended):**
```
0 4 * * * rsync -avz /opt/smfiot-mqtt/backups/ backup@offsite:/srv/smfiot/
```

Or use `restic` / `rclone` to S3-compatible storage.

## Migration checkpoints

- ✅ EMQX + VPS bridge up, test device (SMF-TEST-VPS-01) fully working
- ✅ Web shows sensor data from test device (Vercel + Supabase path verified)
- ✅ 7 days stable
- ⏳ Migrate SMF001: reflash → new credential → verify → keep 24h
- ⏳ Delete HiveMQ credential for SMF001
- ⏳ Stop Railway bridge (revoke Vercel `INGEST_SECRET` access from Railway)
- ⏳ Cancel HiveMQ Cloud subscription (Free tier — nothing to cancel, just delete cluster)

## Security notes

- **Port 1883 not exposed** publicly — `expose:` (docker) only opens it inside `mqttnet` network
- **Dashboard 18083** bound `127.0.0.1` only — SSH tunnel required
- **Bridge non-root** — Dockerfile creates `bridge` user
- **Bridge cannot escalate to EMQX admin** — uses per-service credential
- **INGEST_SECRET** never in bridge code — only env
- **Certs private key** never committed — `.gitignore` protects `certs/`

## Cost

VPS-only architecture:
- VPS (Hetzner CX22 / DO 2vCPU 2GB): $4-6/mo
- Bandwidth: included
- Domain: already owned
- **Total: ~$5/mo**

vs current HiveMQ Cloud Free (5 device cap) → **can scale to 100s of devices at same cost**.

vs HiveMQ Cloud Starter $65/mo → **~10× cheaper** with more control.
