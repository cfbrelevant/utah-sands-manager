# Optional incoming email alerts — not deployed

Email routing on `utahsands.com` is **unchanged**. This prepares a metadata-only Cloudflare Worker and a verified Supabase Edge receiver. The domain currently forwards mail through existing routing; avoid changing that rule until an end-to-end test verifies that forwarding is preserved. Cloudflare allows either a forwarding destination **or** a Worker as the rule's action, so a Worker must explicitly forward mail to the *already verified* destination. See Cloudflare Email Routing documentation.

## Flow

1. Cloudflare Email Routing delivers `support@utahsands.com` (or another configured property alias) to `cloudflare/email-bridge.ts`.
2. Worker **first forwards** the email to your verified destination. The verified address stays in Cloudflare's private secret `EMAIL_FORWARD_TO`, never GitHub.
3. Worker sends only envelope sender, recipient, subject and a SHA-256 dedup key to Supabase. The body and attachments remain solely in the forwarded mailbox. It signs the exact JSON bytes with a secret and timestamp (5 minute replay window).
4. `supabase/functions/inbound-email/index.ts` verifies HMAC, requires a manually verified property inbox alias, stores the metadata under owner-only RLS, creates an event and optionally sends a generic Expo alert.
5. The owner app shows which property received it and provides a shortcut to reply in the existing mail app. **The sender email address is unverified**, even though the *Cloudflare-to-Supabase relay* is authenticated.

## Setup later (requires authorization and owner account)

- Apply base schema plus `20261021_inbound_email.sql` and site-request migration for the common event schema.
- Verify the property is active and independently control its domain. Set `properties.verified_at` and insert `property_inboxes` rows server-side only, e.g. `support@utahsands.com`, with `verified_at` populated **only after** verifying the mailbox/routing configuration.
- Deploy `inbound-email` with `verify_jwt=false`. Set `EMAIL_BRIDGE_HMAC_SECRET` on **both** Supabase and Cloudflare as a long independent random secret. Configure `EMAIL_BRIDGE_ENDPOINT` only to the HTTPS Supabase Edge Function, and Cloudflare `EMAIL_FORWARD_TO` to a **verified forwarding destination**. None of these values belong in the mobile app or Git.
- Enable an Email Routing rule targeting the Worker only after a test verifies forward and alert delivery. Do not change/delete the existing rule without confirming its current destination and an approved rollback plan.
- Test valid/invalid HMAC signatures, aliases, messages to future property addresses, redelivery deduplication, rate limits and spam behavior.
- If all tests pass, optionally configure `EXPO_ACCESS_TOKEN` in the Supabase Edge environment for push to previously registered owner's device(s).

## Limitations

- This is **not an email inbox**: the app does not store bodies, show attachments, or send email on your behalf. Reply opens the user's existing email app.
- Headers and SMTP envelope sender details can be spoofed. Treat mail as an **unverified inquiry**, not confirmation of tenant identity, payment or tenancy. Never derive rent-paid status from a message.
- Delivery is best effort: forwarding is attempted first, and alert failure must not cause email loss. No alert retry queue, sender verification (DMARC), spam controls or receipt reconciliation are implemented.
- Message-ID header is sender-controlled; deduplication is an aid against retries, not an authentication check. Do not use email metadata as an access-control credential.
- Raw email content and customer data must **not** be added to this public repository or placed in build logs.
- Cloudflare docs: https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/
