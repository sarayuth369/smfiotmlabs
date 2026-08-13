import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../_components/SiteHeader";
import { SiteFooter } from "../../_components/SiteFooter";
import { createClient } from "@/lib/supabase/server";
import { HARDWARE, isValidSku } from "@/lib/hardware";
import { getProduct } from "@/lib/catalog";
import { CheckoutClient } from "./_components/CheckoutClient";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  const { sku: rawSku } = await searchParams;

  if (!rawSku || !isValidSku(rawSku)) {
    redirect("/iot-nodes");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/iot-nodes/checkout?sku=${rawSku}`);
  }

  const dbItem = await getProduct(rawSku);
  const item = dbItem
    ? { sku: rawSku, name: dbItem.name, price: dbItem.price }
    : { sku: rawSku, name: HARDWARE[rawSku].name, price: HARDWARE[rawSku].price };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .single();
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const defaultName = profile?.full_name || (meta.full_name as string) || (meta.name as string) || "";
  const defaultPhone = profile?.phone || (meta.phone as string) || "";

  return (
    <>
      <SiteHeader />
      <main className="section-bg-alt min-h-[70vh] py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-4">
            <Link href="/iot-nodes" className="hover:text-brand-900">← เลือกอุปกรณ์อื่น</Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-800">สั่งซื้อ SMF IoT Node</h1>
          <p className="text-sm text-brand-900/60 mt-1">กรอกข้อมูลจัดส่ง แล้วชำระเงินด้วย PromptPay</p>

          <div className="mt-8">
            <CheckoutClient item={item} defaultName={defaultName} defaultPhone={defaultPhone} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
