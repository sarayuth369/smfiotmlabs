# SMF IoT — MQTT Security Baseline

Defensive controls, secret handling, threat model. Refer here before shipping to production.

## Threat model

| Threat | Mitigation |
|---|---|
| Credential leak in git | `.gitignore` `secrets.h` + `.env.local` + BFG history purge after any leak |
| Attacker publishes fake telemetry as victim | HiveMQ ACL (Starter+) + bridge topology validation (Free) |
| Attacker subscribes to victim's topics | HiveMQ ACL (Starter+) + Supabase RLS for read |
| Replay of old telemetry | Timestamp window ±5min at ingest |
| Bridge → Web tampering | HMAC-SHA256 signed body, timing-safe compare |
| Web → Bridge tampering | (future) HMAC on command dispatch endpoint |
| MITM ESP32 → broker | TLS 8883 (currently `setInsecure()` — upgrade to CA cert validation) |
| Broker admin compromise | Rotate credential, revoke, per-device isolation |

## Defense-in-depth layers

**Layer 1 — Firmware secrets:** `secrets.h` gitignored, not committed. Manual reflash to rotate.

**Layer 2 — TLS:** all traffic over `mqtts://8883`. Cert validation via `setCACert(ISRG_ROOT_X1)` recommended (currently `setInsecure()` = encrypted but not authenticated — upgrade before production).

**Layer 3 — Broker ACL (Starter+):** per-credential topic restrictions. Device X cannot publish to Device Y topic even with valid credential.

**Layer 4 — Bridge topology validation:** even if broker ACL absent (Free tier), bridge parses topic → verifies `customer_identity_id + device_uid` combination exists in `iot_nodes` → drops mismatch.

**Layer 5 — Ingest HMAC:** shared secret between Bridge + Web. Signature required per POST. Tampered body fails.

**Layer 6 — Supabase RLS:** even if bridge writes wrong row, users can only SELECT their own farm's data via chain `sensor → device → farm → auth.uid()`.

## Secret inventory (where each lives)

| Secret | Location | Never in |
|---|---|---|
| HiveMQ device password (per-device) | ESP32 `secrets.h` + bcrypt hash in Supabase | git, browser, logs |
| HiveMQ worker password (bridge) | Railway env `HIVEMQ_PASS` | git, browser, Supabase |
| HiveMQ Management API token (Starter+ future) | Vercel env `HIVEMQ_MGMT_API_TOKEN` | git, browser, client bundle |
| `TELEMETRY_INGEST_SECRET` | Vercel env + Railway env (same value) | git, browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env + Railway env | git, browser, `NEXT_PUBLIC_*` |
| `ADMIN_SESSION_SECRET` | Vercel env | git, browser |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Vercel env | git, browser |
| ESP32 CA certificate (public) | firmware `secrets/hivemq_ca.h` (gitignored for tidiness only) | not a secret — public but keep out of tracked source |

## Never do

- Commit `secrets.h`, `.env`, `.env.local`, `platformio.ini` with credentials
- Log passwords, tokens, or bcrypt hashes
- Return plaintext password in API responses (except one-shot at credential creation)
- Store plaintext password in Supabase
- Send secrets via chat, email, or non-encrypted channels
- Reuse credential across multiple devices in production
- Share HiveMQ Management API token — server-side only

## Incident response

**Credential leak detected:**
1. Rotate at HiveMQ Dashboard IMMEDIATELY (delete + create new)
2. Update Railway env / `secrets.h` / SMF DB `device_credentials`
3. Reflash affected ESP32(s)
4. If secret in git history → BFG Repo-Cleaner + force push (see [phase-cleanup docs](../SUPABASE_SETUP.md#security))
5. Audit `device_events` for anomalies during compromise window
6. Notify affected customers if data leakage suspected

**Bridge crash / offline for extended period:**
1. Devices stay ONLINE at broker but Web shows OFFLINE (last_seen > 60s)
2. Backlog accumulates at broker (QoS 1 = deliver on reconnect)
3. Restart bridge → catches up. No data lost within HiveMQ retention (typically 24h)

**HiveMQ tier downgrade (Starter → Free):**
- ACL rules DELETED. All device credentials now unrestricted
- Broker layer isolation LOST — bridge validation becomes only defense
- Recommend: don't downgrade after production launch

## Certification / compliance checkpoints

- ✅ TLS in transit (mqtts + https)
- ✅ Password hashing (bcrypt)
- ✅ RLS row-level access control
- ⚠ TLS cert validation (currently insecure — upgrade before production)
- ⚠ Rate limiting on ingest endpoint (Phase 12 backlog)
- ⚠ Audit log for security events (partial — Section 18 `device_events` exists, needs expansion)
- ❌ Penetration test (not scheduled — Phase 12+)

## Verification checklist (pre-launch)

- [ ] `git log -p -S "<any_secret_pattern>"` returns nothing across all repos (SMF web, bridge, firmware)
- [ ] `.gitignore` in all repos covers `secrets.h`, `.env`, `.env.local`, `*.local`
- [ ] Browser bundle grep for MQTT password / service role / HMAC secret → 0 matches
- [ ] Railway env variables have `Sensitive` flag (Vercel equivalent — value hidden after save)
- [ ] HiveMQ credential for old leaked value confirmed **Deleted**
- [ ] Supabase RLS enabled on `device_credentials`, `iot_nodes`, `sensors`, `sensor_readings`, `sensor_readings_latest`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` never appears in any file with `NEXT_PUBLIC_` prefix
