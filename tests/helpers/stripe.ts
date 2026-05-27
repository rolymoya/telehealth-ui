/**
 * Returns a Stripe test-mode client.
 * Stub until T-023 (Stripe setup) is wired up.
 */
export function getStripeTestClient() {
  // TODO T-023: return Stripe(process.env.STRIPE_SECRET_KEY_TEST)
  throw new Error("Stripe test client not implemented — T-023");
}
