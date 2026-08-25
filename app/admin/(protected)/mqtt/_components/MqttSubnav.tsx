import Link from "next/link";

const TABS = [
  { href: "/admin/mqtt", key: "overview", label: "Overview" },
  { href: "/admin/mqtt/users", key: "users", label: "Users" },
  { href: "/admin/mqtt/bridge", key: "bridge", label: "Bridge" },
] as const;

export function MqttSubnav({ active }: { active: "overview" | "users" | "bridge" }) {
  return (
    <div className="border-b border-border mb-6">
      <div className="flex items-center gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`px-4 py-2.5 text-sm font-medium transition ${
              active === t.key
                ? "text-brand-800 border-b-2 border-brand-600"
                : "text-brand-900/50 hover:text-brand-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
