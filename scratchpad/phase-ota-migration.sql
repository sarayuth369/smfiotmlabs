-- ============================================================
-- Phase OTA — Firmware OTA generic capability/sensor architecture
-- Rerun-safe: every statement is IF NOT EXISTS / IF EXISTS guarded.
-- Builds on SUPABASE_SETUP.md §24 (firmware_releases, firmware_update_jobs
-- already documented there — this migration does NOT duplicate them,
-- only extends).
-- ============================================================

-- 1) firmware_releases already exists (§24.1) — extend with generic
--    capability/sensor metadata + rollout control. Nothing here is
--    specific to any one sensor: capabilities/sensor_types are free-form
--    string arrays the admin fills in per release, read generically by
--    both the web UI and this migration's helper view.
alter table public.firmware_releases
  add column if not exists capabilities jsonb not null default '[]'::jsonb,
  add column if not exists sensor_types jsonb not null default '[]'::jsonb,
  add column if not exists rollout_percent smallint not null default 100
    check (rollout_percent between 0 and 100);

comment on column public.firmware_releases.capabilities is
  'Generic capability identifiers this release supports, e.g. ["automation","mqtt","ota","relay_control"]. Free-form — no schema change needed for a new capability.';
comment on column public.firmware_releases.sensor_types is
  'Generic sensor-type identifiers this release supports/adds, e.g. ["temperature","humidity","co2"]. Free-form — matches sensors.sensor_type values, but is NOT a foreign key (a release can declare support before any device has that sensor wired).';
comment on column public.firmware_releases.rollout_percent is
  'Staged rollout — device is eligible only if its deterministic bucket (hash of device_id) falls below this percent. 100 = all eligible devices.';

-- min_firmware_version already exists per §24.1 (OTA compatibility floor) —
-- no column change needed, just documenting it is used by lib/ota.ts.

-- 2) firmware_update_jobs — create if the live DB doesn't have it yet
--    (identical to §24.2; safe no-op if it already does).
create table if not exists public.firmware_update_jobs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  firmware_release_id uuid not null references public.firmware_releases(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  method text not null default 'ota' check (method in ('ota','usb')),
  state text not null default 'requested'
    check (state in (
      'requested','downloading','verifying','installing','rebooting',
      'health_check','success','failed','rolled_back','cancelled','timeout'
    )),
  from_version text,
  to_version text not null,
  progress smallint check (progress is null or (progress between 0 and 100)),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists firmware_update_jobs_active_uniq
  on public.firmware_update_jobs (device_id)
  where state in ('requested','downloading','verifying','installing','rebooting','health_check');

create index if not exists firmware_update_jobs_device_created_idx
  on public.firmware_update_jobs(device_id, created_at desc);
create index if not exists firmware_update_jobs_state_idx
  on public.firmware_update_jobs(state);

drop trigger if exists firmware_update_jobs_set_updated_at on public.firmware_update_jobs;
create trigger firmware_update_jobs_set_updated_at
  before update on public.firmware_update_jobs
  for each row execute function public.set_updated_at();

alter table public.firmware_update_jobs enable row level security;

drop policy if exists "firmware_update_jobs_select_own" on public.firmware_update_jobs;
create policy "firmware_update_jobs_select_own" on public.firmware_update_jobs for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = firmware_update_jobs.device_id and f.user_id = auth.uid()
  )
);
-- INSERT/UPDATE = service_role only (server action + ingest route)

-- 3) firmware_update_events — granular OTA progress/audit trail (NEW).
--    One row per state transition reported by the device, so admin
--    monitoring can show a full timeline per job, not just the latest
--    state. firmware_update_jobs stays the "current state" summary row.
create table if not exists public.firmware_update_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.firmware_update_jobs(id) on delete cascade,
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  state text not null,
  progress smallint,
  message text,
  occurred_at timestamptz not null default now()
);

create index if not exists firmware_update_events_job_idx
  on public.firmware_update_events(job_id, occurred_at);

alter table public.firmware_update_events enable row level security;

drop policy if exists "firmware_update_events_select_own" on public.firmware_update_events;
create policy "firmware_update_events_select_own" on public.firmware_update_events for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = firmware_update_events.device_id and f.user_id = auth.uid()
  )
);
-- INSERT = service_role only (ingest route)

-- 4) OTA entitlement — 'ota' key already exists in lib/plan-limits.ts's
--    FALLBACK_ENTITLEMENTS (business/enterprise = true, starter/pro =
--    unset = false) and is already in KNOWN_FEATURES for the admin plan
--    editor. This just seeds the SAME distribution into the live
--    subscription_plans rows so the DB matches the code fallback exactly
--    (today the column is probably NULL/missing the key for every plan,
--    which reads as false everywhere — safe to rerun, merges the key
--    without touching other entitlements).
update public.subscription_plans
set entitlements = coalesce(entitlements, '{}'::jsonb) || '{"ota": true}'::jsonb
where plan_id in ('business', 'enterprise');

update public.subscription_plans
set entitlements = coalesce(entitlements, '{}'::jsonb) || '{"ota": false}'::jsonb
where plan_id in ('starter', 'pro');
