"use client";

import { useTransition } from "react";
import { markNotificationRead, markAllNotificationsRead } from "../actions";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function NotificationsPanel({ items }: { items: NotificationItem[] }) {
  const [pending, start] = useTransition();
  const unreadCount = items.filter((n) => !n.read_at).length;

  if (items.length === 0) return null;

  return (
    <div className="mt-8 card p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
            🔔
          </span>
          <div>
            <div className="font-bold text-red-600">การแจ้งเตือน</div>
            {unreadCount > 0 && (
              <div className="text-xs text-brand-700">มี {unreadCount} รายการที่ยังไม่ได้อ่าน</div>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => markAllNotificationsRead())}
            className="text-xs rounded-full border border-border hover:border-brand-400 text-brand-800 px-3 py-1.5 font-medium transition disabled:opacity-70"
          >
            อ่านทั้งหมด
          </button>
        )}
      </div>

      <ul className="space-y-3">
        {items.map((n) => {
          const isUnread = !n.read_at;
          return (
            <li
              key={n.id}
              className={`rounded-xl border p-4 transition ${
                isUnread
                  ? "border-brand-300 bg-brand-50/50"
                  : "border-border bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isUnread && <span className="w-2 h-2 rounded-full bg-brand-600" />}
                    <div className="font-semibold text-brand-800">{n.title}</div>
                  </div>
                  <p className="mt-1 text-sm text-brand-900/75 whitespace-pre-wrap">{n.message}</p>
                  <div className="mt-2 text-[11px] text-brand-900/50">{fmtDate(n.created_at)}</div>
                </div>
                {isUnread && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => start(() => markNotificationRead(n.id))}
                    className="shrink-0 text-xs text-brand-700 hover:text-brand-900 font-medium disabled:opacity-70"
                  >
                    ทำเป็นอ่านแล้ว
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
