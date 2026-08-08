import Link from "next/link";
import { SiteHeader } from "../_components/SiteHeader";
import { SiteFooter } from "../_components/SiteFooter";
import { PricingPlans } from "./_components/PricingPlans";
import { createClient } from "@/lib/supabase/server";
import type { PlanId } from "@/lib/plans";

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let currentPlan: PlanId | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();
    currentPlan = (data?.plan as PlanId) ?? "starter";
  }

  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero-bg py-16 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="chip">💰 Simple & Transparent</span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold text-brand-800 tracking-tight">
              Simple, Transparent Pricing
            </h1>
            <p className="mt-4 text-lg text-brand-900/70 max-w-2xl mx-auto">
              เลือกแพ็กเกจที่เหมาะกับฟาร์มของคุณ เริ่มใช้ฟรี และอัปเกรดเมื่อธุรกิจของคุณเติบโต
            </p>
            {currentPlan && (
              <p className="mt-3 text-sm text-brand-700">
                แพ็กเกจปัจจุบันของคุณ:{" "}
                <span className="font-semibold uppercase">{currentPlan}</span>
              </p>
            )}
          </div>
        </section>

        <section className="py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <PricingPlans currentPlan={currentPlan} isAuthed={!!user} />

            <div className="mt-14 rounded-3xl bg-gradient-to-br from-brand-50 to-white border border-brand-100 p-8 sm:p-10 text-center">
              <h3 className="text-xl sm:text-2xl font-bold text-brand-800">Need a custom solution?</h3>
              <p className="mt-2 text-brand-900/70 max-w-2xl mx-auto">
                Our team can design a complete Smart Farm Platform specifically for your business.
              </p>
              <Link
                href="/#contact"
                className="mt-5 inline-flex rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 transition"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
