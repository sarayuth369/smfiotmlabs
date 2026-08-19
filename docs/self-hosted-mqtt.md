# Self-hosted MQTT — Architecture Overview

Phase 4.7 replaces HiveMQ Cloud Free tier with self-hosted EMQX Community on user's VPS, providing per-device ACL isolation and full credential control.

## Why self-host

| Concern | HiveMQ Free | Self-hosted EMQX |
|---|---|---|
| Cost | $0 (5 device cap) | ~$5-10/mo VPS |
| Credential cap | 5 total | Unlimited |
| Broker ACL | ❌ (no isolation) | ✅ per-device topic |
| Programmatic provisioning | ❌ dashboard only | ✅ REST API (EMQX) |
| Custom domain | ❌ | ✅ `mqtt.bkknex.com` |
| Log/metric access | limited | full |

## Deployment kit location

`D:\Websites\smfiot-mqtt\` — separate git repo, deploy to VPS via `git clone`.

Contents:
- `docker-compose.yml` — EMQX 5.7 + certbot auto-renew
- `emqx/etc/acl.conf` — deny-by-default with per-device rules
- `scripts/init-tls.sh` — Let's Encrypt HTTP-01 standalone
- `test-client.js` — verify auth + ACL isolation
- `.env.example` — secrets template
- `README.md` — VPS deployment steps

## Topology

```
                    ┌─────────────────────┐
                    │  DNS: bkknex.com    │
                    │  mqtt.bkknex.com A  │
                    │       ↓             │
                    │  VPS Public IPv4    │
                    └─────────┬───────────┘
                              │
        ┌─────────────────────┴────────────────────┐
        │  Ubuntu VPS (2 vCPU, 2 GB RAM)           │
        │  ufw: 80, 443, 8883, 8084                │
        │                                          │
        │  ┌─────────────────────────────────┐     │
        │  │  Docker Compose                 │     │
        │  │                                 │     │
        │  │  emqx (5.7 Community)           │     │
        │  │    :8883 mqtts (ESP32)          │     │
        │  │    :8084 wss   (browser/Flutter)│     │
        │  │    :18083 dashboard (127.0.0.1) │     │
        │  │                                 │     │
        │  │  certbot (12h renew loop)       │     │
        │  │    challenge: HTTP-01 :80       │     │
        │  └─────────────────────────────────┘     │
        └──────────────────────────────────────────┘
                              │
     ┌────────────────────────┼─────────────────────────┐
     │                        │                         │
  ESP32 devices          Railway Bridge          Flutter/Web
  (per-device cred)      (smf-bridge sup)        (wss client)
```

## Topic namespace (finalized)

```
smf/{customer_identity_id}/{device_uid}/telemetry
                                        /status
                                        /command
                                        /response
                                        /config
                                        /event/{type}
                                        /relay/{ch}/set
                                        /relay/{ch}/status
```

Enforced by EMQX ACL — see `emqx/etc/acl.conf`.

## Credential model

- **Device** — username = `device_uid` (e.g. `SMF001`), password = random 32-byte, per-unit unique.
  ACL restricts to `smf/+/{device_uid}/*` (any customer path but same device_uid — tighten to fixed customer when EMQX auth plugin returns customer claim).
- **Bridge (worker)** — username = `smf-bridge`, wildcard subscribe. Treated as superuser.
- **Dashboard admin** — created via `.env`. Access via SSH tunnel to `127.0.0.1:18083`.

## Bridge multi-broker (parallel migration)

Railway bridge subscribes BOTH brokers during migration:
- HiveMQ Cloud (legacy `farm/*` + one legacy device SMF001)
- EMQX new (`smf/+/+/*` for all new devices)

Env additions:
```
HIVEMQ_URL_NEW=mqtts://mqtt.bkknex.com:8883
HIVEMQ_USER_NEW=smf-bridge
HIVEMQ_PASS_NEW=<random>
```

Bridge code change (Phase 4.7.1 — not yet implemented): spawn 2 `mqtt.connect()` clients, share message handler. Existing legacy path unchanged.

## Certificate lifecycle

- Issued by Let's Encrypt (ISRG Root X1 → R11 intermediate)
- 90-day validity, auto-renew at ~60 days
- Certbot container runs `certbot renew` every 12h
- On renew: `SIGHUP` sent to EMQX container → hot-reload cert without downtime

**Manual renew (troubleshoot):**
```bash
cd /opt/smfiot-mqtt
docker compose run --rm certbot renew --force-renewal
docker kill --signal=SIGHUP emqx
```

## Firmware CA cert compatibility

ESP32 firmware `include/hivemq_ca.h` already pins **ISRG Root X1** (Phase 4.6). Same cert issues Let's Encrypt → **no firmware change needed** when switching from HiveMQ Cloud to EMQX self-hosted. Only `MQTT_HOST` in `secrets.h` needs update:
```cpp
#define MQTT_HOST     "mqtt.bkknex.com"    // was HiveMQ cluster URL
#define MQTT_PORT     8883
#define MQTT_USER     "SMF001"              // was "smfiot"
#define MQTT_PASSWORD "..."                 // EMQX-issued
```

## Blockers before execution

Session cannot proceed to VPS deploy without user providing:
1. VPS public IPv4 (SSH access — not required for me, required for you to run commands)
2. Confirmation of `bkknex.com` DNS control
3. VPS specs / OS version

Deployment kit at `D:\Websites\smfiot-mqtt\` = ready. Once user has VPS + DNS:
```bash
# On VPS
git clone <push kit to GitHub first> /opt/smfiot-mqtt
cd /opt/smfiot-mqtt
cp .env.example .env
nano .env
chmod +x scripts/init-tls.sh
./scripts/init-tls.sh
docker compose up -d
```

## Files not yet touched

- **Bridge repo** — needs multi-broker patch (parallel subscribe) — deferred to Phase 4.7.1
- **Firmware** — SMF001 kept on HiveMQ during migration; new devices flash with EMQX config
- **SMF Web** — MQTT config page needs new `mqtt.bkknex.com` broker URL display for new devices (small text change)

## Cost estimate

| Item | Monthly |
|---|---|
| VPS (2 vCPU, 2 GB, e.g. Digital Ocean / Vultr / Hetzner) | $5-10 |
| DNS (already own bkknex.com) | $0 |
| Let's Encrypt cert | $0 |
| **Total** | **$5-10/mo** |

vs HiveMQ Starter ($65/mo) = 6-13× cheaper for equal or better capability. Break-even = 1 paying customer.
