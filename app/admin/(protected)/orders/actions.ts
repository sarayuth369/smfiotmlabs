"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = ["pending", "paid", "shipped", "delivered", "canceled"] as const;
type Status = (typeof STATUSES)[number];

function isValidStatus(x: string): x is Status {
  return (STATUSES as readonly string[]).includes(x);
}

export async function updateOrder(orderId: string, formData: FormData): Promise<void> {
  await requireModule("orders");

  const statusRaw = String(formData.get("status") ?? "");
  const tracking_carrier = String(formData.get("tracking_carrier") ?? "").trim() || null;
  const tracking_number = String(formData.get("tracking_number") ?? "").trim() || null;

  if (!isValidStatus(statusRaw)) {
    console.warn("[admin.orders.update] invalid status", statusRaw);
    return;
  }

  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    status: statusRaw,
    tracking_carrier,
    tracking_number,
  };

  const { error } = await admin.from("hardware_orders").update(update).eq("id", orderId);
  if (error) console.warn("[admin.orders.update] db error", error);

  revalidatePath("/admin/orders");
  revalidatePath("/dashboard/orders");
}
