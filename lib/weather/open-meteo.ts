/**
 * Open-Meteo — free, keyless weather REST API. Chosen for the trial
 * period per spec; swap by adding a new WeatherProvider implementation
 * and changing the one line that instantiates it in lib/weather/index.ts
 * — nothing else in the app talks to a provider directly.
 */

import type { WeatherProvider, WeatherSnapshot, CurrentWeather, DailyWeather } from "./types";

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 8_000;

// WMO weather interpretation codes (used by Open-Meteo) — common subset.
const WMO: Record<number, { text: string; icon: string }> = {
  0: { text: "ท้องฟ้าแจ่มใส", icon: "☀️" },
  1: { text: "แจ่มใสเป็นส่วนใหญ่", icon: "🌤" },
  2: { text: "มีเมฆบางส่วน", icon: "⛅" },
  3: { text: "มีเมฆมาก", icon: "☁️" },
  45: { text: "หมอก", icon: "🌫" },
  48: { text: "หมอกน้ำแข็ง", icon: "🌫" },
  51: { text: "ฝนละอองเบา", icon: "🌦" },
  53: { text: "ฝนละออง", icon: "🌦" },
  55: { text: "ฝนละอองหนาแน่น", icon: "🌦" },
  61: { text: "ฝนตกเล็กน้อย", icon: "🌧" },
  63: { text: "ฝนตกปานกลาง", icon: "🌧" },
  65: { text: "ฝนตกหนัก", icon: "🌧" },
  71: { text: "หิมะตกเล็กน้อย", icon: "🌨" },
  73: { text: "หิมะตกปานกลาง", icon: "🌨" },
  75: { text: "หิมะตกหนัก", icon: "🌨" },
  80: { text: "ฝนซู่เล็กน้อย", icon: "🌦" },
  81: { text: "ฝนซู่ปานกลาง", icon: "🌦" },
  82: { text: "ฝนซู่รุนแรง", icon: "⛈" },
  95: { text: "พายุฝนฟ้าคะนอง", icon: "⛈" },
  96: { text: "พายุฝนฟ้าคะนองมีลูกเห็บ", icon: "⛈" },
  99: { text: "พายุฝนฟ้าคะนองรุนแรง", icon: "⛈" },
};

function describeCode(code: number): { text: string; icon: string } {
  return WMO[code] ?? { text: "ไม่ทราบสภาพอากาศ", icon: "🌡" };
}

export class OpenMeteoProvider implements WeatherProvider {
  readonly id = "open-meteo";

  async getWeather(lat: number, lon: number): Promise<WeatherSnapshot> {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
      daily:
        "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max,sunrise,sunset",
      timezone: "auto",
      forecast_days: "7",
    });

    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}?${params.toString()}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      console.warn("[weather.open-meteo] fetch threw", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      throw new Error("weather provider unreachable");
    }
    if (!res.ok) {
      console.warn("[weather.open-meteo] non-200 response", res.status);
      throw new Error("weather provider error");
    }

    const data = await res.json();
    const c = data.current;
    const cCode = describeCode(c.weather_code);
    const current: CurrentWeather = {
      temperature_c: c.temperature_2m,
      humidity_pct: c.relative_humidity_2m,
      precipitation_mm: c.precipitation,
      wind_speed_kmh: c.wind_speed_10m,
      weather_code: c.weather_code,
      weather_text: cCode.text,
      weather_icon: cCode.icon,
      time: c.time,
    };

    const d = data.daily;
    const daily: DailyWeather[] = (d.time as string[]).map((date: string, i: number) => {
      const dCode = describeCode(d.weather_code[i]);
      return {
        date,
        temp_min_c: d.temperature_2m_min[i],
        temp_max_c: d.temperature_2m_max[i],
        precipitation_sum_mm: d.precipitation_sum[i],
        precipitation_probability_max_pct: d.precipitation_probability_max[i],
        wind_speed_max_kmh: d.wind_speed_10m_max[i],
        weather_code: d.weather_code[i],
        weather_text: dCode.text,
        weather_icon: dCode.icon,
        sunrise: d.sunrise?.[i] ?? null,
        sunset: d.sunset?.[i] ?? null,
      };
    });

    return {
      latitude: lat,
      longitude: lon,
      source: this.id,
      current,
      daily,
      fetched_at: new Date().toISOString(),
    };
  }
}
