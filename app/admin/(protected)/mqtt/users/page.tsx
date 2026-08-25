import { requireModule } from "@/lib/admin/current";
import { listMqttUsers } from "@/lib/admin/mqtt-webhook";
import { MqttSubnav } from "../_components/MqttSubnav";
import { CreateUserForm } from "./_components/CreateUserForm";
import { UserRowActions } from "./_components/UserRowActions";

// Non-device service accounts (bridges, dashboard admin) don't match the
// SMF-XXXXXX pattern so the webhook already refuses to disable/delete
// them — this is just an extra visual warning before the confirm dialog.
function looksLikeServiceAccount(username: string): boolean {
  return !/^SMF-[A-F0-9]{6,20}$/i.test(username);
}

export default async function MqttUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  await requireModule("mqtt");
  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const filter = params.filter ?? "all";

  const usersRes = await listMqttUsers();
  const allUsers = usersRes.ok ? usersRes.users : [];

  let users = allUsers;
  if (q) users = users.filter((u) => u.username.toLowerCase().includes(q));
  if (filter === "online") users = users.filter((u) => u.connected_clients > 0);
  if (filter === "offline") users = users.filter((u) => u.connected_clients === 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-800 mb-1">MQTT / Bridge</h1>
      <p className="text-sm text-brand-900/60 mb-4">บริหาร EMQX users + ACL</p>
      <MqttSubnav active="users" />

      {!usersRes.ok && (
        <div className="card p-4 mb-5 border-red-200 bg-red-50 text-red-800 text-sm">
          ดึงรายชื่อ user ไม่ได้: {usersRes.error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <form className="flex items-center gap-2" action="/admin/mqtt/users">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="ค้นหา username..."
            className="rounded-lg border border-border px-3 py-2 text-sm w-56"
          />
          <select name="filter" defaultValue={filter} className="rounded-lg border border-border px-3 py-2 text-sm">
            <option value="all">ทั้งหมด</option>
            <option value="online">Online เท่านั้น</option>
            <option value="offline">Offline เท่านั้น</option>
          </select>
          <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-brand-800">
            ค้นหา
          </button>
        </form>
        <CreateUserForm />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-50/60 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold text-brand-900/70">Username</th>
              <th className="px-4 py-3 font-semibold text-brand-900/70">สถานะ</th>
              <th className="px-4 py-3 font-semibold text-brand-900/70">Connected</th>
              <th className="px-4 py-3 font-semibold text-brand-900/70">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-brand-900/50">
                  ไม่พบ MQTT user
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.username} className="border-t border-border align-middle">
                <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      u.enabled ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {u.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.connected_clients > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> {u.connected_clients} client(s)
                    </span>
                  ) : (
                    <span className="text-xs text-brand-900/40">offline</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <UserRowActions
                    username={u.username}
                    enabled={u.enabled}
                    isProtected={looksLikeServiceAccount(u.username)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
