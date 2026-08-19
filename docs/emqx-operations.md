# EMQX Operations Runbook

Day-2 tasks for the self-hosted MQTT server (see [self-hosted-mqtt.md](self-hosted-mqtt.md) for architecture).

## Access

**Dashboard** (never expose to public internet):
```bash
# From workstation
ssh -L 18083:127.0.0.1:18083 root@VPS_IP
# Open http://127.0.0.1:18083
# Login with EMQX_ADMIN_USER / EMQX_ADMIN_PASSWORD from .env
```

**SSH direct** to EMQX container:
```bash
ssh root@VPS_IP
cd /opt/smfiot-mqtt
docker compose exec emqx bash
```

## Add device credential (manual, POC / small scale)

Dashboard → Access Control → Authentication → Built-in Database → Users → **+ Create**
- Username: `SMF002` (= device_uid, uppercase)
- Password: (dashboard generates or paste from `openssl rand -base64 24`)
- Copy plaintext to Notepad → paste into firmware `secrets.h`

Repeat for each ESP32.

## Add device credential (bulk / automated)

EMQX REST API (v5):
```bash
curl -X POST http://127.0.0.1:18083/api/v5/authentication/password_based:built_in_database/users \
  -u admin:PASSWORD \
  -H "content-type: application/json" \
  -d '{"user_id":"SMF002","password":"RANDOM","is_superuser":false}'
```

Wire into SMF Web `regenerateDeviceCredential()` — set env `MQTT_PROVISIONING_MODE=automatic` + implement EmqxAdapter in `lib/mqtt-credential.ts` (Phase 4.4 stub ready, replace HiveMQ path with EMQX endpoints).

## Rotate credential

Dashboard → Users → click username → **Reset Password** → save new plaintext once → update firmware/config → reflash device.

Old sessions using old password are dropped on next reconnect (~30s keepalive).

## Revoke credential

Dashboard → Users → click username → **Delete**. Device disconnects within seconds. All future connect attempts rejected.

## View connected clients

Dashboard → **Clients** — shows client_id, username, IP, connected time, subscription count.

Filter by username to find specific device.

## Inspect topic traffic

Dashboard → **Websocket** — subscribe with `smf-bridge` credential to `smf/#` → watch live messages. Never subscribe device credential to `smf/#` (ACL will reject anyway).

## Broker health

```bash
# From VPS
docker compose exec emqx /opt/emqx/bin/emqx ctl status
docker compose exec emqx /opt/emqx/bin/emqx ctl broker stats
docker compose logs --tail 100 emqx
```

Key metrics:
- `sessions.count` — active MQTT sessions
- `subscriptions.count` — total topic subscriptions
- `messages.received/sent` — throughput

## Certificate

**Check expiry:**
```bash
openssl x509 -in /opt/smfiot-mqtt/certs/live/mqtt.bkknex.com/fullchain.pem -noout -dates
```

**Force renew (if <30 days remaining or cert error):**
```bash
cd /opt/smfiot-mqtt
docker compose run --rm certbot renew --force-renewal
docker kill --signal=SIGHUP emqx
```

**Reissue from scratch (nuclear option — cert deleted):**
```bash
cd /opt/smfiot-mqtt
docker compose down
rm -rf certs/
./scripts/init-tls.sh
docker compose up -d
```

## Backup

**EMQX built-in DB (users + ACL + rules):**
```bash
docker compose exec emqx /opt/emqx/bin/emqx ctl data export
# → /opt/emqx/data/backup/emqx-export-YYYYMMDD.tar.gz
docker cp emqx:/opt/emqx/data/backup ./backups
```

Copy `./backups` off VPS to secure storage (S3 / rsync / etc.).

**Restore:**
```bash
docker cp ./backups/emqx-export-YYYYMMDD.tar.gz emqx:/tmp/
docker compose exec emqx /opt/emqx/bin/emqx ctl data import /tmp/emqx-export-YYYYMMDD.tar.gz
```

**Config files (git-tracked):**
`docker-compose.yml` + `emqx/etc/acl.conf` — commit changes. `.env` + `certs/` NEVER committed.

## VPS rebuild procedure

If VPS is lost or migrated:

1. Provision new VPS (same or higher specs)
2. Point DNS `mqtt.bkknex.com` A record to new IPv4 (propagation 5-60 min)
3. Repeat Deployment steps from `smfiot-mqtt/README.md`
4. Restore EMQX built-in DB from latest backup
5. Restart devices (they auto-reconnect once broker is up)

**Downtime:** ~10-30 min if backups are current + DNS TTL is low (300s).

## Common issues

**Device can't connect — `Not authorized`:**
- Credential wrong / not created in EMQX → check Dashboard → Users
- Client using wrong TLS port (1883 vs 8883)
- ACL denying — Dashboard → Access Control → ACL → check rules match username

**Device connects then disconnects immediately:**
- Client ID collision (2 devices same client_id) → EMQX kicks first one
- Keepalive too short → check firmware `client.setKeepAlive(60)`

**Cert error `SSL_ERROR_SSL`:**
- Cert expired → force renew (above)
- Client trust anchor wrong → firmware `hivemq_ca.h` must contain ISRG Root X1
- Cert hostname mismatch → firmware `MQTT_HOST` must be `mqtt.bkknex.com` (not IP)

**Bridge (Railway) can't subscribe `smf/+/+/*`:**
- Bridge credential missing wildcard permission → ACL `{allow, {username, "smf-bridge"}, ...}` rule needs update + `docker compose restart emqx`

**Dashboard inaccessible via SSH tunnel:**
- `ssh -L 18083:127.0.0.1:18083 root@VPS` — check firewall on VPS (`ufw allow 22`)
- Port already used locally → change `ssh -L 18099:127.0.0.1:18083 ...`

## Monitoring recommendations

Add these external monitors (not part of deployment kit):
- **Uptime Robot / Better Uptime** — TCP check to `mqtt.bkknex.com:8883` every 5 min
- **Prometheus + Grafana** — EMQX exposes `/api/v5/prometheus` metrics endpoint (behind dashboard auth)
- **Logtail / Loki** — ship `docker compose logs emqx` for anomaly detection

## Escalation path

Broker down → data lost:
1. Check Vercel status (ingest side) — sometimes issue is downstream
2. Check EMQX logs — `docker compose logs --tail 200 emqx`
3. Check VPS resource — `df -h`, `free -m`, `docker stats`
4. Restart EMQX — `docker compose restart emqx` (session state preserved via built-in DB)
5. Reboot VPS as last resort — data persists on volume
6. Restore from backup if data volume corrupted
