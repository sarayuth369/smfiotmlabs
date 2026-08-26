import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sensor-type catalog — admin-managed (Admin > Sensors), backed by the
 * sensor_type_catalog table. Falls back to this static list only if that
 * table is empty/unreachable (e.g. before the Phase 6.12 SQL has run).
 */
export type SensorTypeInfo = {
  key: string;
  label: string;
  icon: string;
  unit: string;
  sortOrder: number;
};

const STATIC_FALLBACK: SensorTypeInfo[] = [
  { key: "temperature", label: "Temperature", icon: "🌡", unit: "°C", sortOrder: 1 },
  { key: "humidity", label: "Humidity", icon: "💧", unit: "%", sortOrder: 2 },
  { key: "soil_moisture", label: "Soil Moisture", icon: "🌱", unit: "%", sortOrder: 3 },
  { key: "light", label: "Light", icon: "☀", unit: "lux", sortOrder: 4 },
  { key: "npk", label: "NPK", icon: "🧪", unit: "ppm", sortOrder: 5 },
  { key: "ph", label: "pH", icon: "🧫", unit: "pH", sortOrder: 6 },
  { key: "ec", label: "EC", icon: "⚡", unit: "mS/cm", sortOrder: 7 },
  { key: "co2", label: "CO₂", icon: "🌫", unit: "ppm", sortOrder: 8 },
  { key: "voltage", label: "Voltage", icon: "🔌", unit: "V", sortOrder: 9 },
  { key: "current", label: "Current", icon: "⚡", unit: "A", sortOrder: 10 },
  { key: "power", label: "Power", icon: "💡", unit: "W", sortOrder: 11 },
  { key: "rssi", label: "WiFi Signal", icon: "📶", unit: "dBm", sortOrder: 12 },
];

export async function getSensorTypeCatalog(supabase: SupabaseClient): Promise<SensorTypeInfo[]> {
  const { data } = await supabase
    .from("sensor_type_catalog")
    .select("key, label, icon, default_unit, sort_order")
    .order("sort_order", { ascending: true });

  if (!data || data.length === 0) return STATIC_FALLBACK;

  return data.map((r) => ({
    key: r.key as string,
    label: r.label as string,
    icon: r.icon as string,
    unit: r.default_unit as string,
    sortOrder: r.sort_order as number,
  }));
}

export function findSensorType(catalog: SensorTypeInfo[], key: string): SensorTypeInfo | undefined {
  return catalog.find((t) => t.key === key);
}

export function isValidSensorTypeFrom(catalog: SensorTypeInfo[], key: string | null | undefined): boolean {
  if (!key) return false;
  return catalog.some((t) => t.key === key);
}

export function sensorTypeLabelFrom(catalog: SensorTypeInfo[], key: string): string {
  return findSensorType(catalog, key)?.label ?? key;
}

export function sensorTypeIconFrom(catalog: SensorTypeInfo[], key: string): string {
  return findSensorType(catalog, key)?.icon ?? "📊";
}

export function defaultUnitFrom(catalog: SensorTypeInfo[], key: string): string {
  return findSensorType(catalog, key)?.unit ?? "";
}

/**
 * Slice of the catalog a plan may CHOOSE FROM when adding a new sensor —
 * capped at the plan's max_sensors (null = unlimited = full catalog).
 * Order matches admin's sort_order, so e.g. Starter (max_sensors=2) only
 * ever sees the first 2 types admin created (Temperature, Humidity by
 * default), encouraging upgrade for the rest.
 */
export function visibleSensorTypesForPlan(catalog: SensorTypeInfo[], maxSensors: number | null): SensorTypeInfo[] {
  if (maxSensors === null) return catalog;
  return catalog.slice(0, maxSensors);
}
