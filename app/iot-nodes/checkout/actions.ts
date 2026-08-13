"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { HARDWARE, isValidSku, type SKU } from "@/lib/hardware";
import { getProduct } from "@/lib/catalog";
import {
  generateOrderNumber,
  parseShippingFromForm,
  validateShipping,
  type ShippingInfo,
} from "@/lib/orders";

export type StartResult =
  | {
      ok: true;
      paymentIntentId: string;
      qrImageUrl: string;
      qrImageUrlPng: string;
      orderNumber: string;
      amount: number;
      quantity: number;
    }
  | { ok: false; error: string };

export async function startCheckout(sku: string, formData: FormData): Promise<StartResult> {
  if (!isValidSku(sku)) return { ok: false, error: "Invalid SKU" };

  const qty = Math.max(1, Math.min(100, parseInt(String(formData.get("quantity") ?? "1"), 10) || 1));
  const ship = parseShippingFromForm(formData);
  const shipErr = validateShipping(ship);
  if (shipErr) return { ok: false, error: shipErr };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อน" };

  const dbItem = await getProduct(sku);
  const item = dbItem ? { name: dbItem.name, price: dbItem.price } : HARDWARE[sku];

  const unitPrice = item.price;
  const amount = unitPrice * qty;
  const orderNumber = generateOrderNumber(sku);

  try {
    const pi = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "thb",
      payment_method_types: ["promptpay"],
      description: `SMF IoT — ${item.name} × ${qty} (${orderNumber})`,
      metadata: {
        user_id: user.id,
        type: "hardware",
        sku,
        order_number: orderNumber,
        quantity: String(qty),
        unit_price: String(unitPrice),
        product_name: item.name,
        ship_name: ship.ship_name,
        ship_phone: ship.ship_phone,
        ship_address: ship.ship_address.slice(0, 500),
        ship_city: ship.ship_city,
        ship_postal: ship.ship_postal,
        ship_note: ship.ship_note.slice(0, 200),
      },
    });

    const confirmed = await stripe.paymentIntents.confirm(pi.id, {
      payment_method_data: {
        type: "promptpay",
        billing_details: {
          name: ship.ship_name,
          email: user.email ?? undefined,
          phone: ship.ship_phone,
        },
      },
    });

    const qr =
      confirmed.next_action?.type === "promptpay_display_qr_code"
        ? confirmed.next_action.promptpay_display_qr_code
        : undefined;

    if (!qr?.image_url_svg) return { ok: false, error: "ไม่พบข้อมูล QR จาก Stripe" };

    // NOTE: intentionally NOT inserting into hardware_orders yet.
    // Insertion happens only on successful payment (via webhook or poll fallback).
    return {
      ok: true,
      paymentIntentId: pi.id,
      qrImageUrl: qr.image_url_svg,
      qrImageUrlPng: qr.image_url_png,
      orderNumber,
      amount,
      quantity: qty,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "สร้างรายการชำระเงินไม่สำเร็จ";
    return { ok: false, error: msg };
  }
}

export type PollResult =
  | { status: "succeeded"; orderNumber: string }
  | { status: "processing" | "requires_action" | "requires_payment_method" | "canceled" }
  | { status: "error"; error: string };

/** Idempotent: creates the hardware_orders row from Stripe metadata on first success. */
export async function pollCheckout(paymentIntentId: string): Promise<PollResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", error: "unauthenticated" };

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.metadata.user_id !== user.id) return { status: "error", error: "forbidden" };

    if (pi.status === "succeeded") {
      const md = pi.metadata as Record<string, string>;
      const orderNumber = md.order_number;
      if (!orderNumber || !isValidSku(md.sku)) {
        return { status: "error", error: "metadata missing" };
      }

      const { data: existing } = await supabase
        .from("hardware_orders")
        .select("order_number")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();

      if (!existing) {
        const qty = parseInt(md.quantity ?? "1", 10) || 1;
        const unitPrice = parseFloat(md.unit_price ?? "0") || 0;
        await supabase.from("hardware_orders").insert({
          user_id: user.id,
          order_number: orderNumber,
          sku: md.sku as SKU,
          product_name: md.product_name,
          quantity: qty,
          unit_price: unitPrice,
          amount: unitPrice * qty,
          method: "stripe_promptpay",
          status: "paid",
          stripe_payment_intent_id: paymentIntentId,
          ship_name: md.ship_name,
          ship_phone: md.ship_phone,
          ship_address: md.ship_address,
          ship_city: md.ship_city,
          ship_postal: md.ship_postal,
          ship_note: md.ship_note,
          paid_at: new Date().toISOString(),
        });
        revalidatePath("/dashboard/orders");
      }
      return { status: "succeeded", orderNumber };
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

export type { ShippingInfo };
