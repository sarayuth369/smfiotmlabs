/**
 * Centralized sensor-type catalog. Add new types here — everywhere else reads from this map.
 */

export const SENSOR_TYPES = {
  temperature: { label: "Temperature", icon: "🌡", unit: "°C" },
  humidity: { label: "Humidity", icon: "💧", unit: "%" },
  soil_moisture: { label: "Soil Moisture", icon: "🌱", unit: "%" },
  light: { label: "Light", icon: "☀", unit: "lux" },
  npk: { label: "NPK", icon: "🧪", unit: "ppm" },
  ph: { label: "pH", icon: "🧫", unit: "pH" },
  ec: { label: "EC", icon: "⚡", unit: "mS/cm" },
  co2: { label: "CO₂", icon: "🌫", unit: "ppm" },
  voltage: { label: "Voltage", icon: "🔌", unit: "V" },
  current: { label: "Current", icon: "⚡", unit: "A" },
  power: { label: "Power", icon: "💡", unit: "W" },
  rssi: { label: "WiFi Signal", icon: "📶", unit: "dBm" },
} as const;

export type SensorType = keyof typeof SENSOR_TYPES;

export function isValidSensorType(x: string | null | undefined): x is SensorType {
  if (!x) return false;
  return x in SENSOR_TYPES;
}

export function sensorTypeLabel(t: string): string {
  return isValidSensorType(t) ? SENSOR_TYPES[t].label : t;
}

export function sensorTypeIcon(t: string): string {
  return isValidSensorType(t) ? SENSOR_TYPES[t].icon : "📊";
}

export function defaultUnit(t: string): string {
  return isValidSensorType(t) ? SENSOR_TYPES[t].unit : "";
}
