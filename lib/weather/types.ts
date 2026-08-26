/** Phase 6.15 — weather abstraction. UI/AI never call a provider directly. */

export type CurrentWeather = {
  temperature_c: number;
  humidity_pct: number;
  precipitation_mm: number;
  wind_speed_kmh: number;
  weather_code: number;
  weather_text: string;
  weather_icon: string;
  time: string;
};

export type DailyWeather = {
  date: string; // YYYY-MM-DD
  temp_min_c: number;
  temp_max_c: number;
  precipitation_sum_mm: number;
  precipitation_probability_max_pct: number;
  wind_speed_max_kmh: number;
  weather_code: number;
  weather_text: string;
  weather_icon: string;
  sunrise: string | null;
  sunset: string | null;
};

export type WeatherSnapshot = {
  latitude: number;
  longitude: number;
  source: string;
  current: CurrentWeather;
  daily: DailyWeather[]; // [today, tomorrow, ...] up to 7 days
  fetched_at: string;
};

export interface WeatherProvider {
  readonly id: string;
  getWeather(lat: number, lon: number): Promise<WeatherSnapshot>;
}
