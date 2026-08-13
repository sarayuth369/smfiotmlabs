"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { PLAN_INFO, type PlanId } from "@/lib/plans";
import { computeNextExpiry } from "@/lib/payment";
import { getPlanPrice } from "@/lib/catalog";

export type CreatePaymentResult =
  | {
      ok: true;
      paymentIntentId: string;
      qrImageUrl: string;
      qrImageUrlPng: string;
      amount: number;
    }
  | { ok: false; error: string };

/**
 * Create a Stripe PaymentIntent with PromptPay and return the QR image URL
 * hosted by Stripe. The PromptPay QR is short-lived (~10 min).
 */
export async function createStripePromptPay(
  plan: "pro" | "business",
  months: number = 1
): Promise<CreatePaymentResult> {
  if (plan !== "pro" && plan !== "business") {
    return { ok: false, error: "Invalid plan" };
  }
  const n = Math.max(1, Math.min(12, Math.floor(months) || 1));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อน" };

  const monthlyPrice = (await getPlanPrice(plan)) || PLAN_INFO[plan].price;
  const amount = monthlyPrice * n;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (meta.full_name as string) ||
    (meta.name as string) ||
    user.email?.split("@")[0] ||
    "SMF User";

  try {
    const pi = await stripe.paymentIntents.create({
      amount: amount * 100, // THB → satang
      currency: "thb",
      payment_method_types: ["promptpay"],
      description: `SMF IoT — ${PLAN_INFO[plan].name} plan × ${n} เดือน`,
      metadata: {
        user_id: user.id,
        plan,
        months: String(n),
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

    const { error: dbErr } = await supabase.from("payment_requests").insert({
      user_id: user.id,
      plan,
      amount,
      method: "stripe_promptpay",
      status: "pending",
      stripe_payment_intent_id: pi.id,
    });
    if (dbErr) return { ok: false, error: dbErr.message };

    return {
      ok: true,
      paymentIntentId: pi.id,
      qrImageUrl: qr.image_url_svg,
      qrImageUrlPng: qr.image_url_png,
      amount,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "สร้างรายการชำระเงินไม่สำเร็จ";
    return { ok: false, error: msg };
  }
}

export type PollResult =
  | { status: "succeeded"; plan: PlanId }
  | { status: "processing" | "requires_action" | "requires_payment_method" | "canceled" }
  | { status: "error"; error: string };

/**
 * Client polls this while modal is open. Also acts as a fallback for the
 * webhook: if Stripe says succeeded but our profile isn't upgraded yet
 * (webhook late or missing), upgrade using the current user's session.
 */
export async function pollStripePayment(paymentIntentId: string): Promise<PollResult> {
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
      const plan = pi.metadata.plan as PlanId;
      const months = parseInt(String(pi.metadata.months ?? "1"), 10) || 1;
      if (plan === "pro" || plan === "business") {
        const { data: prof } = await supabase
          .from("profiles")
          .select("plan_expires_at")
          .eq("id", user.id)
          .single();
        const nextExpiry = computeNextExpiry(prof?.plan_expires_at ?? null, months);

        await supabase
          .from("profiles")
          .update({ plan, plan_expires_at: nextExpiry.toISOString() })
          .eq("id", user.id);
        await supabase
          .from("payment_requests")
          .update({ status: "verified", verified_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", paymentIntentId);
        revalidatePath("/dashboard");
        revalidatePath("/pricing");
      }
      return { status: "succeeded", plan };
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
