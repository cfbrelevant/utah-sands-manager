# Site → Owner app request pipeline (not deployed)

This feature is implemented in the GitHub branch but **not connected** to live UtahSands. The current maintenance/payment pages are demonstration-only. This form is a new alternative to deploy *after* configuring the backend. No customer information or secrets are committed.

## Flow

1. Visitor opens the deployed web form on an approved property domain.
2. Cloudflare Turnstile issues a token with action `resident-request`.
3. The public Supabase Edge Function validates input, exact HTTPS Origin, **server-side Turnstile token**, expected action and signed hostname.
4. Only a property with `active` state and server-verified `verified_at` may accept submissions.
5. The restricted service-role database function atomically stores the private request and creates one low-detail activity event. Rate-limited to five requests per sender email per property per hour, with a salted digest (not plaintext) in the rate table. **This is secondary to Turnstile, not protection against distributed spam.** Add Cloudflare WAF/rate limiting as needed.
6. The signed-in mobile app can load the owner's events via RLS. A public submission is **unverified** until its claimed resident identity has been confirmed. Never classify it as a tenant-authenticated service request.

## Configure

- Supabase: create project and owner; apply `supabase/schema.sql`, then `supabase/migrations/20261021_site_submissions.sql`.
- In Supabase `properties`, configure the address/host; set `state='active'` and `verified_at` using a **trusted server/admin session only after independently verifying DNS ownership**. Do not let public forms or mobile owner clients set verified_at.
- In Cloudflare Turnstile, configure widget for the property host(s). The server keeps `TURNSTILE_SECRET_KEY`, and the website gets only the corresponding public site key.
- Set Supabase Edge Function secrets `TURNSTILE_SECRET_KEY`, `SUBMISSION_RATE_SALT` (random, server-only, stable), and ensure `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` exist in its environment. Keep secrets entirely server-side.
- Deploy `submit-site-request` with `supabase/config.toml` (verify_jwt=false). This is a **public** route intentionally, with Turnstile and strict input/host checks in code.
- Replace the placeholders in `web/utahsands-requests.html` with the actual **public** Turnstile site key and HTTPS Supabase function URL; deploy the page through your existing site publisher. Its origin must be `https://utahsands.com` or exactly the subdomain associated with the property.
- In the owner app, configure Supabase publishable key and project URL. Test a real submit with a test email before inviting tenants.

No email service, file upload, or tenant authentication is included. Do not claim email replies are automatic. Do not move real rent payment processing onto this form.

## Privacy & abuse

- Never send request text, name, or sender email to public push notifications or system logs.
- Use email/contact details only within owner-authenticated views.
- Clean up `site_submission_limits` older than a week through a scheduled, service-role-only job (not yet set up). Establish privacy/retention policies before production.
- Add a dedicated authenticated tenant flow for official maintenance notices and upload security before using the form for sensitive issues.
- Test RLS with two distinct owners before production; one owner must never see another's submissions.
- CORS is browser protection, **not authentication**. Security depends on the server-side Turnstile check and verified DB host mapping.
- Secrets must never go into this GitHub repo, even if you eventually make it private.
