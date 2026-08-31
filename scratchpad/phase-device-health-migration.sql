-- ============================================================
-- Device Health & Monitoring v1.0
-- Rerun-safe. Extends existing iot_nodes/sensors/sensor_readings_latest
-- schema — no new device model, no new telemetry payload.
-- ============================================================

-- 1) device_health — current computed state, one row per device.
create table if not exists public.device_health (
  device_id uuid primary key references public.iot_nodes(id) on delete cascade,
  status text not null default 'offline'
    check (status in ('healthy','warning','critical','offline')),
  health_score smallint not null default 0 check (health_score between 0 and 100),
  last_seen_at timestamptz,
  last_telemetry_at timestamptz,
  mqtt_status text,
  sensor_status text,
  firmware_version text,
  issues jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  last_evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_health_status_idx on public.device_health(status);
create index if not exists device_health_last_evaluated_idx on public.device_health(last_evaluated_at);

drop trigger if exists device_health_set_updated_at on public.device_health;
create trigger device_health_set_updated_at
  before update on public.device_health
  for each row execute function public.set_updated_at();

alter table public.device_health enable row level security;

-- Device owner may read their own device's health (admin reads via
-- service_role, which bypasses RLS — matches firmware_releases pattern).
drop policy if exists "device_health_select_owner" on public.device_health;
create policy "device_health_select_owner" on public.device_health for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = device_health.device_id and f.user_id = auth.uid()
  )
);
-- INSERT/UPDATE = service_role only (health engine + cron sweep)

-- 2) device_health_events — append-only transition/issue history.
create table if not exists public.device_health_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.iot_nodes(id) on delete cascade,
  previous_status text,
  new_status text not null,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists device_health_events_device_created_idx
  on public.device_health_events(device_id, created_at desc);

alter table public.device_health_events enable row level security;

drop policy if exists "device_health_events_select_owner" on public.device_health_events;
create policy "device_health_events_select_owner" on public.device_health_events for select using (
  exists (
    select 1 from public.iot_nodes n
    join public.farms f on f.id = n.farm_id
    where n.id = device_health_events.device_id and f.user_id = auth.uid()
  )
);
-- INSERT = service_role only (health engine, on meaningful transitions only)
