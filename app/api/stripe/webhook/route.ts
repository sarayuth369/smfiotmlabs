import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeNextExpiry } from "@/lib/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json(
      { error: "missing signature or webhook secret" },
      { status: 400 }
    );
  }

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid signature";
    return NextResponse.json({ error: `webhook error: ${msg}` }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const userId = pi.metadata.user_id;
    const type = pi.metadata.type ?? "plan"; // default to plan for backward compat
    const admin = createAdminClient();

    if (type === "hardware") {
      // Insert hardware order from metadata (idempotent by stripe_payment_intent_id).
      const md = pi.metadata as Record<string, string>;
      const { data: existing } = await admin
        .from("hardware_orders")
        .select("id")
        .eq("stripe_payment_intent_id", pi.id)
        .maybeSingle();

      if (!existing && md.order_number && md.sku && md.user_id) {
        const qty = parseInt(md.quantity ?? "1", 10) || 1;
        const unitPrice = parseFloat(md.unit_price ?? "0") || 0;
        await admin.from("hardware_orders").insert({
          user_id: md.user_id,
          order_number: md.order_number,
          sku: md.sku,
          product_name: md.product_name,
          quantity: qty,
          unit_price: unitPrice,
          amount: unitPrice * qty,
          method: "stripe_promptpay",
          status: "paid",
          stripe_payment_intent_id: pi.id,
          ship_name: md.ship_name,
          ship_phone: md.ship_phone,
          ship_address: md.ship_address,
          ship_city: md.ship_city,
          ship_postal: md.ship_postal,
          ship_note: md.ship_note,
          paid_at: new Date().toISOString(),
        });
      } else if (existing) {
        // Row already exists (poll inserted) — just ensure status/paid_at
        await admin
          .from("hardware_orders")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", pi.id);
      }
    } else {
      const plan = pi.metadata.plan;
      const months = parseInt(String(pi.metadata.months ?? "1"), 10) || 1;
      if (userId && (plan === "pro" || plan === "business")) {
        const { data: prof } = await admin
          .from("profiles")
          .select("plan_expires_at")
          .eq("id", userId)
          .single();
        const nextExpiry = computeNextExpiry(prof?.plan_expires_at ?? null, months);

        await admin
          .from("profiles")
          .update({ plan, plan_expires_at: nextExpiry.toISOString() })
          .eq("id", userId);
        await admin
          .from("payment_requests")
          .update({ status: "verified", verified_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", pi.id);
      }
    }
  }

  if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const type = pi.metadata.type ?? "plan";
    const admin = createAdminClient();

    if (type === "hardware") {
      await admin
        .from("hardware_orders")
        .update({ status: "canceled" })
        .eq("stripe_payment_intent_id", pi.id);
    } else {
      await admin
        .from("payment_requests")
        .update({ status: "rejected" })
        .eq("stripe_payment_intent_id", pi.id);
    }
  }

  return NextResponse.json({ received: true });
}
