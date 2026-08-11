import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySession, type AdminSession } from "./session";
import { canAccess, type Module } from "./rbac";

export async function getAdminSession(): Promise<AdminSession | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  return verifySession(token);
}

export async function requireAdmin(): Promise<AdminSession> {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  return s;
}

export async function requireModule(mod: Module): Promise<AdminSession> {
  const s = await requireAdmin();
  if (!canAccess(s.role, mod)) redirect("/admin/dashboard");
  return s;
}
