# Stripe rent alerts: code ready for integration, not collecting payments

**Nothing here is active.** The live site is still a demo; no Stripe account, checkout page, billing account, webhook destination, or bank account was connected. This project is still in a PUBLIC GitHub repository: keep all credentials and tenant/payment details OUT OF GIT.

## What is implemented

- `supabase/functions/stripe-rent-webhook/index.ts`: Deno webhook endpoint that validates Stripe's signature over the raw request, enforces Stripe test-vs-live mode, and ignores events unrelated to successful PaymentIntents and cumulative refunds.
- `supabase/migrations/20261021_stripe_rent.sql`: trusted PaymentIntent-to-property bindings and one-row-per-PaymentIntent ledger, restricted to the owner via RLS. Duplicate webhook event IDs are ignored; repeated success notifications cannot count one charge twice. Refund snapshots update the cumulative refunded total monotonically, including delayed/out-of-order refund events.
- Mobile overview calculates the **net confirmed payments** from the ledger instead of adding up activity alerts. The ledger counts processor-confirmed payments less recorded refunds, *not* a deposited bank balance or accounting reconciliation.
- If owner push registration, preferences and server `EXPO_ACCESS_TOKEN` are configured, the Stripe event receiver attempts generic push alerts on newly recorded payments/refunds. Lock-screen notifications do not include addresses, payer data or amounts.

## Required before even a test-mode end-to-end run

1. Create a private Supabase project. Apply `supabase/schema.sql`, `supabase/migrations/20261021_site_submissions.sql` (owner events reference that file's submission ID), and `supabase/migrations/20261021_stripe_rent.sql`. Confirm all owner RLS policies with *two separate test owners*.
2. Configure Stripe in **test mode** and use a provider-hosted, secure payment flow. Do not collect card or bank details through UtahSands forms.
3. Create a trusted backend checkout/PaymentIntent creation endpoint (NOT IMPLEMENTED). When a genuine charge is initiated, insert the Stripe `payment_intent.id`, verified `property_id`, intended USD amount and currency into `stripe_payment_bindings` **before** initiating confirmation. Only trusted service-role code may create these bindings. Neither the mobile app nor the payer may set this mapping or amount.
4. Configure the Stripe webhook destination for only `payment_intent.succeeded` and `charge.refunded` events (snapshot events, not thin notifications). Set `STRIPE_WEBHOOK_SIGNING_SECRET`, `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and **explicitly** `STRIPE_EXPECT_LIVEMODE=false` for test mode. All are **server-only**. The function uses `verify_jwt = false` because a **verified Stripe signature** authenticates the inbound event. To use live mode later, review everything and deliberately set `STRIPE_EXPECT_LIVEMODE=true` with live keys.
5. Deploy `stripe-rent-webhook` to Supabase and point Stripe to the endpoint. Use Stripe's CLI or dashboard to send controlled test events for prebound IDs. Confirm fake signatures fail, unbound IDs are not credited, repeated event IDs make no duplicates, and a partial/full refund reduces net totals.
6. Register a physical owner device (EAS development build), enable owner payment alerts, and optionally set server-only `EXPO_ACCESS_TOKEN`. Push delivery is best effort; the confirmed event remains in the app even if Expo is unavailable.

## Strict boundaries and limitations

- A Stripe `payment_intent.succeeded` event is **not** proof that Stripe transferred funds to your bank; payouts, processing fees, holds, disputes and chargebacks are separate. Do not use this as a definitive rent ledger without accounting reconciliation.
- Failures, disputes, chargebacks, bounced bank transfers, payout reconciliation, retries/outbox and receipt reconciliation are **not handled yet**. Do not represent this draft integration as production-ready or tell tenants to pay via it.
- Only one successful charge per bound PaymentIntent is assumed. Revisit charge/refund modeling if the processor/payment method allows several successful charges or more complex adjustments.
- Test your legal/payment-provider obligations around rent, payment-method fees, receipts and refunds before collecting payments.
- The server responds 503 and lets Stripe retry if the trusted payment binding is absent or storage is unavailable. It does not silently invent a property from Stripe metadata.
- Do not put Stripe keys in Expo `EXPO_PUBLIC_...` variables, HTML, Cloudflare Pages source or GitHub.
- This is deliberately a draft PR; do not deploy, merge, publish, or initiate live transactions without reviewing the security and accounting gaps.
