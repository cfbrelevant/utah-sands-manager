# Future live integration: Utah Sands

Current app is a **preview**. It does not connect to live email, payment processors, maintenance requests, or push notifications. Sample data are synthetic and clearly marked.

## Architecture

- One central database keyed by `property_id`, not separate databases for each subdomain.
- `utahsands.com` is the existing property website (Haviture), and future sites such as `another.utahsands.com` are mapped by exact verified hostname to a property.
- A signed-in owner sees only properties they own. Tenant access will require a separate restricted role and separate routes, not the owner app.
- Mobile: Expo. Backend candidate: Supabase Auth + Postgres + Edge Functions, with Row Level Security.
- Sender systems: Stripe (payments), Cloudflare Email Routing / an inbound email service (messages), and real website request forms (maintenance/inspection).

## Milestones before real alerts

1. Provision Supabase project, configure owner login, apply `supabase/schema.sql`, and inspect its RLS policies.
2. Confirm you control each property hostname; create property + hostname records and verify routing. Never decide property ownership from user-submitted hostname alone.
3. Replace the current UtahSands demo forms with authenticated backend submissions. Add file storage with secure access for photos.
4. Add a **trusted server-side PaymentIntent creation** flow and register its `pi_...` ID/property/expected USD amount in `stripe_payment_bindings` before the payer is charged. The signed Stripe webhook receiver is present in code and maintains a separate ledger for successes and cumulative refunds. Do **not** enable real payments until refund, failure, chargeback, dispute, payout reconciliation, and authorization flows have had a complete end-to-end security review (see `docs/STRIPE_RENT.md`).
5. Route inbound emails through a verified service into server-side event records; avoid storing unnecessary email content. Do not expose tenant email addresses in logs.
6. Register Expo push tokens **after owner authentication**, send notifications only from a trusted server, and honor per-owner alert preferences. Never embed a service-role key or payment secret in the app.
7. Add audit trail, data retention policy, opt-out, secure attachments, accessibility checks, and tests on real devices.

No domains, DNS, Stripe account, inbox, or Supabase project have been modified by this repo change.

## Security rules

- GitHub repository was public at project initialization: **no real personal information or secrets in git**, even after it becomes private.
- A public mobile `anon` key is not an admin credential; enforce RLS. Service-role keys are server-side only.
- Clients may read authorized events and mark them seen; clients must not generate their own verified payment events.
- Do not store payment cards or bank details. Use a payment provider's hosted flow.
- This schema is a starting point, not a completed production security review.
