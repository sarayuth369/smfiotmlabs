-- Seed demo farm/zone/device/sensors for the Play Store review account
-- (biz2success@gmail.com — must already exist, sign up via the app/site first).
-- Run once in Supabase SQL Editor (runs as superuser, bypasses RLS).
-- Safe to re-run: each run creates a NEW farm/device (random device_uid),
-- so re-running just adds another demo farm rather than erroring.

do $$
declare
  v_user_id uuid;
  v_farm_id uuid;
  v_zone_id uuid;
  v_device_id uuid;
  v_temp_sensor_id uuid;
  v_humid_sensor_id uuid;
  v_soil_sensor_id uuid;
  v_now timestamptz := now();
  i int;
begin
  select id into v_user_id from auth.users where email = 'biz2success@gmail.com';
  if v_user_id is null then
    raise exception 'user not found for email biz2success@gmail.com — sign up with this email first';
  end if;

  insert into public.farms (name, farm_type, area_unit, user_id)
  values ('ฟาร์มทดสอบ SMF', 'Smart Farm', 'ไร่', v_user_id)
  returning id into v_farm_id;

  insert into public.zones (name, crop_type, area_unit, farm_id)
  values ('โซน 1', 'ผัก', 'ไร่', v_farm_id)
  returning id into v_zone_id;

  insert into public.iot_nodes (device_uid, device_name, device_type, model, firmware_version, farm_id, zone_id, hardware_model)
  values ('REVIEW-' || substr(md5(random()::text), 1, 8), 'SMF Node 01', 'ESP32-S3', 'SMF-MAIN-V1', '1.0.0', v_farm_id, v_zone_id, 'SMF-MAIN-V1')
  returning id into v_device_id;

  insert into public.sensors (name, sensor_type, unit, status, device_id, record_history, history_interval_minutes)
  values ('อุณหภูมิอากาศ', 'temperature', '°C', 'active', v_device_id, true, 30)
  returning id into v_temp_sensor_id;

  insert into public.sensors (name, sensor_type, unit, status, device_id, record_history, history_interval_minutes)
  values ('ความชื้นอากาศ', 'humidity', '%', 'active', v_device_id, true, 30)
  returning id into v_humid_sensor_id;

  insert into public.sensors (name, sensor_type, unit, status, device_id, record_history, history_interval_minutes)
  values ('ความชื้นดิน', 'soil_moisture', '%', 'active', v_device_id, true, 30)
  returning id into v_soil_sensor_id;

  -- 24h of hourly history per sensor, so History charts aren't empty.
  for i in 0..24 loop
    insert into public.sensor_readings (sensor_id, device_id, value, unit, occurred_at)
    values (v_temp_sensor_id, v_device_id, round((28 + (random()-0.5)*3)::numeric, 1), '°C', v_now - (24-i) * interval '1 hour');

    insert into public.sensor_readings (sensor_id, device_id, value, unit, occurred_at)
    values (v_humid_sensor_id, v_device_id, round((65 + (random()-0.5)*10)::numeric, 1), '%', v_now - (24-i) * interval '1 hour');

    insert into public.sensor_readings (sensor_id, device_id, value, unit, occurred_at)
    values (v_soil_sensor_id, v_device_id, round((42 + (random()-0.5)*8)::numeric, 1), '%', v_now - (24-i) * interval '1 hour');
  end loop;

  -- "Current value" row per sensor — same table/shape the real telemetry
  -- ingest route (app/api/telemetry/ingest/route.ts) upserts into.
  insert into public.sensor_readings_latest (sensor_id, device_id, value, unit, occurred_at, received_at)
  select distinct on (sensor_id) sensor_id, device_id, value, unit, occurred_at, occurred_at
  from public.sensor_readings
  where device_id = v_device_id
  order by sensor_id, occurred_at desc
  on conflict (sensor_id) do update set
    value = excluded.value, unit = excluded.unit,
    occurred_at = excluded.occurred_at, received_at = excluded.received_at;

  raise notice 'Seeded farm=% zone=% device=% for user=%', v_farm_id, v_zone_id, v_device_id, v_user_id;
end $$;
