/**
 * Firmware version utilities. Semantic versioning only — reject non-semver
 * to avoid string comparison bugs (e.g. "1.10.0" < "1.9.0" as string).
 */

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export type ParsedVersion = { major: number; minor: number; patch: number };

export function parseVersion(v: string | null | undefined): ParsedVersion | null {
  if (!v) return null;
  const m = SEMVER_RE.exec(v.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function isValidVersion(v: string): boolean {
  return parseVersion(v) !== null;
}

/** -1 if a < b, 0 if equal, 1 if a > b. Non-semver → 0 (safe default). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
}

export function isUpdateAvailable(currentVersion: string | null, latestVersion: string | null): boolean {
  if (!currentVersion || !latestVersion) return false;
  return compareVersions(currentVersion, latestVersion) === -1;
}
