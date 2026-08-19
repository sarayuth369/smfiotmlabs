# HiveMQ Free → Starter Migration Runbook

Step-by-step to enable automated provisioning + per-device ACL when HiveMQ Cloud Starter tier is subscribed. **No code changes needed** — adapter switches by env var.

## Pre-check (before upgrade)

- [ ] SMF001 currently ONLINE + telemetry flowing
- [ ] Section 23 SQL run in Supabase (adds `provisioning_status`, `hivemq_credential_id` columns)
- [ ] Latest code deployed on Vercel (Phase 4.4 = adapter has full `HivemqCloudAdapter`)
- [ ] Backup credentials list from current HiveMQ Free tier (Dashboard → Access Management → copy usernames)

## Upgrade steps

### 1. HiveMQ Dashboard — upgrade tier

1. HiveMQ Cloud → **Manage Plan** → Starter ($65/mo)
2. Enter payment — subscription active immediately
3. Cluster stays same, credentials preserved
4. **Verify:** SMF001 still ONLINE — no interruption from tier upgrade alone

### 2. Get REST API token

1. HiveMQ Dashboard → **Access Management** → **API Keys** (or **Automation**)
2. Create key — name `smf-web-provisioning`
3. Permissions: **Access Management full** (create/delete users + set permissions)
4. **Copy token ONCE** — Notepad, then Vercel env

### 3. Set Vercel environment variables

Vercel → smfiotlabs → Settings → Environment Variables:

| Name | Value |
|---|---|
| `MQTT_PROVISIONING_MODE` | `automatic` |
| `HIVEMQ_MGMT_API_URL` | `https://<your-cluster-id>.s2.eu.hivemq.cloud` (or from HiveMQ docs) |
| `HIVEMQ_MGMT_API_TOKEN` | (token from step 2) |

Environments: Production + Preview + Development (mark as Sensitive)

Redeploy — Deployments → latest → **Redeploy**

### 4. Verify adapter switch

After deploy, test with a **NEW throwaway device** (not SMF001):

1. Web → create test farm → create test device
2. Device → MQTT tab → **สร้าง Credential ใหม่**
3. Expected: yellow box shows username+password (as before) + **no** "manual instruction" section
4. HiveMQ Dashboard → Access Management → **credential exists automatically** with matching username
5. Permissions on credential = ACL rules from `HivemqCloudAdapter.buildAcl()`

### 5. Migrate existing devices (SMF001 last)

For each existing device (test devices first, SMF001 LAST):

1. Device → MQTT tab → **Regenerate**
2. Copy new plaintext password
3. Update firmware `secrets.h` with new password
4. Compile + flash
5. Verify device reconnects (Railway bridge logs)
6. Delete old `smfiot` shared credential from HiveMQ Dashboard (once all devices migrated)

### 6. Update Railway Bridge credential (optional)

Bridge currently uses shared credential. To isolate:

1. Create separate worker credential in HiveMQ Dashboard:
   - Username: `smf-worker`
   - Password: random
   - Permissions:
     - Subscribe: `smf/+/+/telemetry`, `smf/+/+/status`, `smf/+/+/response`, `smf/+/+/event/+`, `farm/#`
     - Publish (future): `smf/+/+/command`, `smf/+/+/config`, `smf/+/+/relay/+/set`
2. Railway env vars → `HIVEMQ_USER=smf-worker` + `HIVEMQ_PASS=<new>`
3. Railway auto-redeploy → verify `[mqtt] subscribed 11 topics`

## Rollback plan

If Starter enable causes issues:

1. Vercel env → `MQTT_PROVISIONING_MODE=manual` → redeploy
2. Adapter falls back — manual dashboard workflow again
3. Existing device credentials created in Starter mode continue working (they exist in HiveMQ) — just can't auto-manage from Web
4. Downgrade HiveMQ tier at end of billing period (existing ACLs preserved during transition)

## Cost / limit calculator

Starter tier:
- $65/mo base
- 100 concurrent sessions (100 devices + 1 bridge)
- 10 GB traffic/mo
- 100 credentials max
- REST API included

Break-even math: Pro plan customer = $499/mo. **1 paying customer = tier paid + 6.7× profit.**

## What Starter unlocks

- ✅ Automated credential provision on Regenerate click (no manual HiveMQ dashboard step)
- ✅ Per-device ACL — device X cannot publish to device Y topic
- ✅ Per-device revoke — kill 1 credential without affecting others
- ✅ True multi-tenant broker isolation
- ✅ Per-credential audit trail via HiveMQ Dashboard
- ✅ Bridge topology validation becomes redundant safety net (ACL blocks at broker first)

## What still needed after Starter

- Firmware reflash — each ESP32 gets per-device credential + new namespace topics
- Legacy `farm/*` topics deprecated (keep bridge dual-mode during transition)
- Flutter App broker Settings — user still copy-paste per device (or Phase 4.5 auto-provision API)
