/**
 * Extend a plan by N months (default 1).
 * If the plan is still active, extend from the current expiry so users don't
 * lose remaining paid days. If expired or never set, start from now.
 */
export function computeNextExpiry(
  currentExpiresAt: string | null | undefined,
  months: number = 1
): Date {
  const n = Math.max(1, Math.min(12, Math.floor(months) || 1));
  const now = new Date();
  const cur = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const base = cur && cur > now ? cur : now;
  const next = new Date(base);
  next.setMonth(next.getMonth() + n);
  return next;
}

export function formatThaiDate(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatThaiDateTime(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function daysUntil(iso: string): number {
  const now = new Date();
  const target = new Date(iso);
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
