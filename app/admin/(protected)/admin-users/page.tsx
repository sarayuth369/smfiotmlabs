import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABEL } from "@/lib/admin/rbac";
import type { AdminRole } from "@/lib/admin/session";
import { formatThaiDate } from "@/lib/payment";
import {
  createAdminUser,
  setActive,
  updateRole,
  resetPassword,
  deleteAdminUser,
} from "./actions";

const ROLES: AdminRole[] = ["super_admin", "admin", "support", "sales", "technician", "content"];

export default async function AdminUsersPage() {
  const session = await requireModule("admin_users");
  const admin = createAdminClient();

  const { data: users } = await admin
    .from("admin_users")
    .select("id, username, role, is_active, last_login_at, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">Admin Users</h1>
        <p className="text-sm text-brand-900/60 mt-0.5">จัดการผู้ดูแลระบบและสิทธิ์การเข้าถึง</p>
      </div>

      {/* Create form */}
      <form action={createAdminUser} className="card p-6 mb-8 grid sm:grid-cols-4 gap-3">
        <label className="block sm:col-span-1">
          <span className="text-xs font-semibold text-brand-900/70">ชื่อผู้ใช้</span>
          <input
            type="text"
            name="username"
            required
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
          />
        </label>
        <label className="block sm:col-span-1">
          <span className="text-xs font-semibold text-brand-900/70">รหัสผ่าน (≥8 ตัว)</span>
          <input
            type="password"
            name="password"
            minLength={8}
            required
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
          />
        </label>
        <label className="block sm:col-span-1">
          <span className="text-xs font-semibold text-brand-900/70">Role</span>
          <select
            name="role"
            defaultValue="admin"
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 text-sm transition"
          >
            + เพิ่มผู้ใช้
          </button>
        </div>
      </form>

      {/* User list */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-brand-900/70">
            <tr>
              <th className="text-left p-3 font-semibold">Username</th>
              <th className="text-left p-3 font-semibold">Role</th>
              <th className="text-left p-3 font-semibold">Last Login</th>
              <th className="text-left p-3 font-semibold">Created</th>
              <th className="text-left p-3 font-semibold">Status</th>
              <th className="text-right p-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(users ?? []).map((u: any) => {
              const isSelf = u.id === session.id;
              return (
                <tr key={u.id} className="align-middle">
                  <td className="p-3 font-medium text-brand-800">
                    {u.username}
                    {isSelf && <span className="ml-2 text-[10px] font-bold text-brand-600">YOU</span>}
                  </td>
                  <td className="p-3">
                    <form action={updateRole.bind(null, u.id)} className="flex items-center gap-2">
                      <select
                        name="role"
                        defaultValue={u.role}
                        disabled={isSelf}
                        className="rounded-lg border border-border bg-white px-2 py-1 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                      {!isSelf && (
                        <button type="submit" className="text-xs text-brand-700 hover:text-brand-900 underline">
                          บันทึก
                        </button>
                      )}
                    </form>
                  </td>
                  <td className="p-3 text-xs text-brand-900/65">
                    {u.last_login_at ? formatThaiDate(u.last_login_at) : "—"}
                  </td>
                  <td className="p-3 text-xs text-brand-900/65">{formatThaiDate(u.created_at)}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${u.is_active ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}`}>
                      {u.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <form action={resetPassword.bind(null, u.id)} className="inline-flex items-center gap-1">
                        <input
                          type="password"
                          name="password"
                          placeholder="รหัสใหม่"
                          minLength={8}
                          className="w-24 rounded-lg border border-border bg-white px-2 py-1 text-xs"
                        />
                        <button type="submit" className="text-xs text-brand-700 hover:text-brand-900 underline">
                          Reset
                        </button>
                      </form>
                      {!isSelf && (
                        <>
                          <form action={setActive.bind(null, u.id, !u.is_active)}>
                            <button type="submit" className="text-xs text-amber-700 hover:text-amber-900 underline">
                              {u.is_active ? "Disable" : "Enable"}
                            </button>
                          </form>
                          <form action={deleteAdminUser.bind(null, u.id)}>
                            <button type="submit" className="text-xs text-red-600 hover:text-red-800 underline">
                              Delete
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
