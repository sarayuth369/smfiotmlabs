import crypto from "crypto";

const SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  "smfiot-admin-dev-fallback-secret-change-me";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const COOKIE_NAME = "smf_admin";
export const MAX_AGE_SEC = MAX_AGE_MS / 1000;

export type AdminRole =
  | "super_admin"
  | "admin"
  | "support"
  | "sales"
  | "technician"
  | "content";

export type AdminSession = {
  id: string;
  username: string;
  role: AdminRole;
  exp: number;
};

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str: string): Buffer {
  const pad = 4 - (str.length % 4);
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + (pad < 4 ? "=".repeat(pad) : "");
  return Buffer.from(s, "base64");
}

export function signSession(payload: Omit<AdminSession, "exp">): string {
  const full: AdminSession = { ...payload, exp: Date.now() + MAX_AGE_MS };
  const body = b64urlEncode(Buffer.from(JSON.stringify(full)));
  const sig = b64urlEncode(crypto.createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined | null): AdminSession | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64urlEncode(crypto.createHmac("sha256", SECRET).update(body).digest());
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString()) as AdminSession;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
