import Link from "next/link";
import { requireModule } from "@/lib/admin/current";
import { SystemTimeCard } from "./_components/SystemTimeCard";

export default async function SettingsHubPage() {
  await requireModule("settings");

  const items = [
    {
      href: "/admin/settings/line",
      title: "LINE Integration",
      desc: "Channel access token + Group ID สำหรับส่งประกาศเข้ากลุ่ม LINE",
      icon: "💬",
    },
  ];

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-brand-800">System Settings</h1>
      <p className="text-sm text-brand-900/60 mt-1">ตั้งค่าระบบและ integration ต่าง ๆ</p>

      <div className="mt-6">
        <SystemTimeCard />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {items.map((it) => (
          <Link key={it.href} href={it.href} className="card p-6 hover:border-brand-400 transition">
            <div className="text-3xl">{it.icon}</div>
            <div className="mt-3 font-bold text-brand-800">{it.title}</div>
            <p className="text-sm text-brand-900/60 mt-1">{it.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
