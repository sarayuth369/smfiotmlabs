"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";

export async function deletePlanOrder(orderId: string): Promise<void> {
  await requireModule("plan_orders");

  const admin = createAdminClient();
  const { error } = await admin.from("payment_requests").delete().eq("id", orderId);
  if (error) console.warn("[admin.plan-orders.delete] db error", error);

  revalidatePath("/admin/plan-orders");
}
