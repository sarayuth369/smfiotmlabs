"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export type ResumeResult =
  | { ok: true; paymentIntentId: string; qrImageUrl: string; amount: number }
  | { ok: false; error: string };

/**
 * Create a fresh Stripe PaymentIntent (PromptPay) for a pending hardware order.
 * Attaches the new payment_intent_id to the order row so the webhook + poll can
 * mark it paid.
 */
export async function resumeOrderPayment(orderId: string): Promise<ResumeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };

  const { data: order } = await supabase
    .from("hardware_orders")
    .select("id, order_number, sku, product_name, amount, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!order) return { ok: false, error: "ไม่พบคำสั่งซื้อ" };
  if (order.status !== "pending") {
    return { ok: false, error: "คำสั่งซื้อนี้ไม่อยู่ในสถานะรอชำระ" };
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (meta.full_name as string) ||
    (meta.name as string) ||
    user.email?.split("@")[0] ||
    "SMF User";

  try {
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(Number(order.amount) * 100),
      currency: "thb",
      payment_method_types: ["promptpay"],
      description: `SMF IoT — ${order.product_name} (${order.order_number})`,
      metadata: {
        user_id: user.id,
        type: "hardware",
        sku: order.sku,
        order_number: order.order_number,
        order_id: order.id,
      },
    });

    const confirmed = await stripe.paymentIntents.confirm(pi.id, {
      payment_method_data: {
        type: "promptpay",
        billing_details: {
          name: displayName,
          email: user.email ?? undefined,
        },
      },
    });

    const qr =
      confirmed.next_action?.type === "promptpay_display_qr_code"
        ? confirmed.next_action.promptpay_display_qr_code
        : undefined;
    if (!qr?.image_url_svg) return { ok: false, error: "ไม่พบข้อมูล QR จาก Stripe" };

    // Attach the fresh PI to the order so poll + webhook find it.
    await supabase
      .from("hardware_orders")
      .update({ stripe_payment_intent_id: pi.id })
      .eq("id", orderId);

    return {
      ok: true,
      paymentIntentId: pi.id,
      qrImageUrl: qr.image_url_svg,
      amount: Number(order.amount),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "สร้างรายการชำระเงินไม่สำเร็จ";
    return { ok: false, error: msg };
  }
}

export type PollResult =
  | { status: "succeeded" | "canceled" | "processing" | "requires_action" | "requires_payment_method" }
  | { status: "error"; error: string };

export async function pollOrderPayment(paymentIntentId: string): Promise<PollResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", error: "unauthenticated" };

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.metadata.user_id !== user.id) return { status: "error", error: "forbidden" };

    if (pi.status === "succeeded") {
      await supabase
        .from("hardware_orders")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("stripe_payment_intent_id", paymentIntentId);
      revalidatePath("/dashboard/orders");
      revalidatePath("/dashboard");
      return { status: "succeeded" };
    }
    if (pi.status === "canceled") return { status: "canceled" };
    if (pi.status === "requires_action") return { status: "requires_action" };
    if (pi.status === "requires_payment_method") return { status: "requires_payment_method" };
    return { status: "processing" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "poll failed";
    return { status: "error", error: msg };
  }
}
