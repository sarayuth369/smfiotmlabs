"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { HARDWARE, isValidSku, type SKU } from "@/lib/hardware";

export type CreateOrderResult =
  | {
      ok: true;
      paymentIntentId: string;
      qrImageUrl: string;
      qrImageUrlPng: string;
      amount: number;
    }
  | { ok: false; error: string };

/**
 * Create a Stripe PaymentIntent (PromptPay) for a hardware SKU
 * and insert a row into `hardware_orders`.
 */
export async function createHardwareOrder(sku: string): Promise<CreateOrderResult> {
  if (!isValidSku(sku)) return { ok: false, error: "Invalid SKU" };

  const item = HARDWARE[sku];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อน" };

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (meta.full_name as string) ||
    (meta.name as string) ||
    user.email?.split("@")[0] ||
    "SMF User";

  try {
    const pi = await stripe.paymentIntents.create({
      amount: item.price * 100,
      currency: "thb",
      payment_method_types: ["promptpay"],
      description: `SMF IoT — ${item.name}`,
      metadata: {
        user_id: user.id,
        type: "hardware",
        sku,
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

    if (!qr?.image_url_svg) {
      return { ok: false, error: "ไม่พบข้อมูล QR จาก Stripe" };
    }

    const { error: dbErr } = await supabase.from("hardware_orders").insert({
      user_id: user.id,
      sku,
      product_name: item.name,
      amount: item.price,
      status: "pending",
      stripe_payment_intent_id: pi.id,
    });
    if (dbErr) return { ok: false, error: dbErr.message };

    return {
      ok: true,
      paymentIntentId: pi.id,
      qrImageUrl: qr.image_url_svg,
      qrImageUrlPng: qr.image_url_png,
      amount: item.price,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "สร้างรายการชำระเงินไม่สำเร็จ";
    return { ok: false, error: msg };
  }
}

export type PollOrderResult =
  | { status: "succeeded"; sku: SKU }
  | { status: "processing" | "requires_action" | "requires_payment_method" | "canceled" }
  | { status: "error"; error: string };

export async function pollHardwareOrder(paymentIntentId: string): Promise<PollOrderResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", error: "unauthenticated" };

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (pi.metadata.user_id !== user.id) {
      return { status: "error", error: "forbidden" };
    }

    if (pi.status === "succeeded") {
      const sku = pi.metadata.sku;
      if (typeof sku === "string" && isValidSku(sku)) {
        await supabase
          .from("hardware_orders")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", paymentIntentId);
        revalidatePath("/dashboard");
      }
      return { status: "succeeded", sku: sku as SKU };
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
