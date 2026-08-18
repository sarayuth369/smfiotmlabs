/**
 * Analytics utilities — pure functions for trend / comparison / health score.
 * No DB access — caller provides pre-fetched data.
 */

export type Trend = "up" | "down" | "stable";

export type TrendResult = {
  trend: Trend;
  changePercent: number; // signed
};

/** Trend from two averages. Stable if change < 3%. */
export function calculateTrend(current: number, previous: number): TrendResult {
  if (previous === 0) {
    return { trend: current === 0 ? "stable" : "up", changePercent: 0 };
  }
  const change = ((current - previous) / previous) * 100;
  const abs = Math.abs(change);
  return {
    trend: abs < 3 ? "stable" : change > 0 ? "up" : "down",
    changePercent: Math.round(change * 10) / 10,
  };
}

export type ThresholdStatus = "normal" | "warning_low" | "warning_high" | "critical_low" | "critical_high" | "no_threshold";

export type Thresholds = {
  min_normal: number | null;
  max_normal: number | null;
  min_critical: number | null;
  max_critical: number | null;
};

export function evaluateThreshold(value: number, t: Thresholds | null): ThresholdStatus {
  if (!t) return "no_threshold";
  if (t.min_critical !== null && value < t.min_critical) return "critical_low";
  if (t.max_critical !== null && value > t.max_critical) return "critical_high";
  if (t.min_normal !== null && value < t.min_normal) return "warning_low";
  if (t.max_normal !== null && value > t.max_normal) return "warning_high";
  return "normal";
}

// ============================================================
// Farm Health Score — 0..100
// ============================================================

export type HealthInputs = {
  totalDevices: number;
  offlineDevices: number;
  sensorCount: number;
  newCriticalAnomalies: number;
  newWarningAnomalies: number;
  activeAutomations: number;
  automationFailures24h: number;
};

export type HealthResult = {
  score: number;
  band: "critical" | "poor" | "good" | "excellent";
  breakdown: {
    devicePenalty: number;
    criticalAnomalyPenalty: number;
    warningAnomalyPenalty: number;
    automationPenalty: number;
  };
};

export function calculateFarmHealth(input: HealthInputs): HealthResult {
  const devicePenalty =
    input.totalDevices > 0 ? Math.round((input.offlineDevices / input.totalDevices) * 10) : 0;
  const criticalAnomalyPenalty = Math.round(
    (input.newCriticalAnomalies / Math.max(1, input.sensorCount)) * 15
  );
  const warningAnomalyPenalty = Math.round(
    (input.newWarningAnomalies / Math.max(1, input.sensorCount)) * 5
  );
  const automationPenalty = Math.round(
    (input.automationFailures24h / Math.max(1, input.activeAutomations)) * 10
  );

  const raw =
    100 - devicePenalty - criticalAnomalyPenalty - warningAnomalyPenalty - automationPenalty;
  const score = Math.max(0, Math.min(100, raw));

  const band =
    score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "poor" : "critical";

  return {
    score,
    band,
    breakdown: {
      devicePenalty,
      criticalAnomalyPenalty,
      warningAnomalyPenalty,
      automationPenalty,
    },
  };
}

/** Format signed percentage for display: "+12.3%" / "-8.5%". */
export function formatChangePercent(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}
