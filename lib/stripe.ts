import Stripe from "stripe";

// Lazy so a missing env var only errors when Stripe is actually used,
// not during build or unrelated page renders.
let _client: Stripe | null = null;
function getClient(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  _client = new Stripe(key);
  return _client;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    return client[prop as string | symbol];
  },
});
