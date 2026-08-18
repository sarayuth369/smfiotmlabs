/**
 * Statistical anomaly detection — no ML dependencies.
 *
 * Called from cron scan (analytics-scan) not from ingest path — cheap enough
 * to run per-sensor over recent readings, expensive enough not to block ingest.
 */

export type DetectionMethod = "threshold" | "sigma" | "rate_of_change" | "stale" | "stuck";
export type Severity = "info" | "warning" | "critical";

export type Anomaly = {
  method: DetectionMethod;
  severity: Severity;
  value: number | null;
  expectedMin?: number | null;
  expectedMax?: number | null;
  reason: string;
};

export type ReadingPoint = { value: number; occurred_at: string };

export type Thresholds = {
  min_normal: number | null;
  max_normal: number | null;
  min_critical: number | null;
  max_critical: number | null;
};

/** Threshold check on single latest reading. */
export function detectThreshold(latest: ReadingPoint, t: Thresholds | null): Anomaly | null {
  if (!t) return null;
  if (t.min_critical !== null && latest.value < t.min_critical) {
    return {
      method: "threshold",
      severity: "critical",
      value: latest.value,
      expectedMin: t.min_critical,
      reason: `ค่าต่ำวิกฤต (${latest.value} < ${t.min_critical})`,
    };
  }
  if (t.max_critical !== null && latest.value > t.max_critical) {
    return {
      method: "threshold",
      severity: "critical",
      value: latest.value,
      expectedMax: t.max_critical,
      reason: `ค่าสูงวิกฤต (${latest.value} > ${t.max_critical})`,
    };
  }
  if (t.min_normal !== null && latest.value < t.min_normal) {
    return {
      method: "threshold",
      severity: "warning",
      value: latest.value,
      expectedMin: t.min_normal,
      reason: `ค่าต่ำกว่าปกติ (${latest.value} < ${t.min_normal})`,
    };
  }
  if (t.max_normal !== null && latest.value > t.max_normal) {
    return {
      method: "threshold",
      severity: "warning",
      value: latest.value,
      expectedMax: t.max_normal,
      reason: `ค่าสูงกว่าปกติ (${latest.value} > ${t.max_normal})`,
    };
  }
  return null;
}

/** 3-sigma detection over a rolling window. Requires >= 10 samples. */
export function detectSigma(readings: ReadingPoint[], latest: ReadingPoint): Anomaly | null {
  if (readings.length < 10) return null;
  const values = readings.map((r) => r.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const sigma = Math.sqrt(variance);
  if (sigma === 0) return null; // constant series — sigma useless, caught by stuck
  const z = Math.abs(latest.value - mean) / sigma;
  if (z >= 3) {
    return {
      method: "sigma",
      severity: z >= 5 ? "critical" : "warning",
      value: latest.value,
      expectedMin: Math.round((mean - 3 * sigma) * 100) / 100,
      expectedMax: Math.round((mean + 3 * sigma) * 100) / 100,
      reason: `ค่าเบี่ยงเบน ${z.toFixed(1)}σ จากค่าเฉลี่ย ${mean.toFixed(2)}`,
    };
  }
  return null;
}

/** Rate-of-change: > 20% of value range per minute between two adjacent readings. */
export function detectRateOfChange(readings: ReadingPoint[]): Anomaly | null {
  if (readings.length < 2) return null;
  // Sorted DESC by occurred_at — take latest two
  const [curr, prev] = readings;
  const dtMin = (new Date(curr.occurred_at).getTime() - new Date(prev.occurred_at).getTime()) / 60000;
  if (dtMin <= 0 || dtMin > 30) return null; // ignore stale gaps
  const range = Math.max(1, Math.abs(prev.value));
  const rate = Math.abs(curr.value - prev.value) / range / dtMin;
  if (rate >= 0.2) {
    return {
      method: "rate_of_change",
      severity: rate >= 0.5 ? "critical" : "warning",
      value: curr.value,
      reason: `ค่าเปลี่ยนแปลงเร็ว ${(rate * 100).toFixed(0)}%/นาที (จาก ${prev.value} → ${curr.value})`,
    };
  }
  return null;
}

/** Stale = no reading within `expectedIntervalSec * 3`. */
export function detectStale(latest: ReadingPoint | null, expectedIntervalSec: number): Anomaly | null {
  if (!latest) {
    return {
      method: "stale",
      severity: "warning",
      value: null,
      reason: "ไม่พบข้อมูล sensor เลย",
    };
  }
  const ageSec = (Date.now() - new Date(latest.occurred_at).getTime()) / 1000;
  if (ageSec > expectedIntervalSec * 3) {
    const ageMin = Math.round(ageSec / 60);
    return {
      method: "stale",
      severity: ageSec > expectedIntervalSec * 10 ? "critical" : "warning",
      value: latest.value,
      reason: `sensor ไม่ส่งข้อมูลมา ${ageMin} นาที (คาดหวังทุก ${Math.round(expectedIntervalSec / 60)} นาที)`,
    };
  }
  return null;
}

/** Stuck = same value for 20+ consecutive readings (with non-trivial history). */
export function detectStuck(readings: ReadingPoint[]): Anomaly | null {
  if (readings.length < 20) return null;
  const first = readings[0].value;
  const allSame = readings.slice(0, 20).every((r) => r.value === first);
  if (allSame) {
    return {
      method: "stuck",
      severity: "info",
      value: first,
      reason: `ค่า sensor คงที่ ${first} นาน ${readings.length} readings — อาจ sensor เสีย`,
    };
  }
  return null;
}

/**
 * Run all detectors on a sensor's recent readings (DESC by occurred_at).
 * Returns first-matched anomaly per method (max 5 per sensor).
 */
export function detectAllAnomalies(
  readings: ReadingPoint[],
  thresholds: Thresholds | null,
  expectedIntervalSec: number = 300
): Anomaly[] {
  const results: Anomaly[] = [];
  const latest = readings[0] ?? null;

  const stale = detectStale(latest, expectedIntervalSec);
  if (stale) results.push(stale);

  if (latest) {
    const threshold = detectThreshold(latest, thresholds);
    if (threshold) results.push(threshold);

    const sigma = detectSigma(readings.slice(0, 100), latest);
    if (sigma) results.push(sigma);

    const rate = detectRateOfChange(readings);
    if (rate) results.push(rate);
  }

  const stuck = detectStuck(readings);
  if (stuck) results.push(stuck);

  return results.slice(0, 5);
}
