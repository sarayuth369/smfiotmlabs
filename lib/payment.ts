/**
 * Extend a plan by 1 month.
 * If the plan is still active, extend from the current expiry so users don't
 * lose remaining paid days. If expired or never set, start from now.
 */
export function computeNextExpiry(currentExpiresAt: string | null | undefined): Date {
  const now = new Date();
  const cur = currentExpiresAt ? new Date(currentExpiresAt) : null;
  const base = cur && cur > now ? cur : now;
  const next = new Date(base);
  next.setMonth(next.getMonth() + 1);
  return next;
}

export function formatThaiDate(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function daysUntil(iso: string): number {
  const now = new Date();
  const target = new Date(iso);
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
