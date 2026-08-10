import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const plan = pi.metadata.plan;

    if (userId && (plan === "pro" || plan === "business")) {
      const admin = createAdminClient();

      await admin.from("profiles").update({ plan }).eq("id", userId);
      await admin
        .from("payment_requests")
        .update({ status: "verified", verified_at: new Date().toISOString() })
        .eq("stripe_payment_intent_id", pi.id);
    }
  }

  if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const admin = createAdminClient();
    await admin
      .from("payment_requests")
      .update({ status: "rejected" })
      .eq("stripe_payment_intent_id", pi.id);
  }

  return NextResponse.json({ received: true });
}
