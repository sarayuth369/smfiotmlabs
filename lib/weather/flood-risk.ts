/**
 * FloodRiskProvider — no official flood/warning API is integrated (none
 * available without a key or a reliably-documented free endpoint), so
 * per spec this derives a WATCH-level heuristic from real forecast
 * precipitation only. Never presented as a confirmed flood forecast —
 * only "ควรเฝ้าระวัง" (should watch), matching the spec's explicit
 * wording constraint. Swappable later behind the same interface once a
 * real flood-warning source is integrated.
 */

import type { DailyWeather } from "./types";

export type FloodRiskLevel = "normal" | "watch" | "warning";

export type FloodRisk = {
  level: FloodRiskLevel;
  precipitation_24h_mm: number;
  precipitation_48h_mm: number;
  reason: string;
};

// Thresholds are a simple, disclosed heuristic — not an official flood model.
const WATCH_MM_24H = 35;
const WARNING_MM_24H = 70;

export interface FloodRiskProvider {
  readonly id: string;
  deriveRisk(daily: DailyWeather[]): FloodRisk;
}

export class HeuristicFloodRiskProvider implements FloodRiskProvider {
  readonly id = "heuristic-precipitation";

  deriveRisk(daily: DailyWeather[]): FloodRisk {
    const today = daily[0]?.precipitation_sum_mm ?? 0;
    const tomorrow = daily[1]?.precipitation_sum_mm ?? 0;
    const p24 = today;
    const p48 = today + tomorrow;

    if (p24 >= WARNING_MM_24H || p48 >= WARNING_MM_24H * 1.5) {
      return {
        level: "warning",
        precipitation_24h_mm: p24,
        precipitation_48h_mm: p48,
        reason: `คาดการณ์ฝนสะสมสูง (${p24.toFixed(0)} มม. ใน 24 ชม.) ควรตรวจสอบทางระบายน้ำและพื้นที่ต่ำของแปลงอย่างใกล้ชิด`,
      };
    }
    if (p24 >= WATCH_MM_24H || p48 >= WATCH_MM_24H * 1.5) {
      return {
        level: "watch",
        precipitation_24h_mm: p24,
        precipitation_48h_mm: p48,
        reason: `คาดการณ์ฝนสะสมปานกลาง (${p24.toFixed(0)} มม. ใน 24 ชม.) ควรเฝ้าระวังและตรวจสอบทางระบายน้ำ`,
      };
    }
    return {
      level: "normal",
      precipitation_24h_mm: p24,
      precipitation_48h_mm: p48,
      reason: "ยังไม่พบข้อมูลยืนยันความเสี่ยงน้ำท่วมในพื้นที่ ปริมาณฝนคาดการณ์อยู่ในเกณฑ์ปกติ",
    };
  }
}
