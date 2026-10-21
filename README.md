# Utah Sands Manager

A clean, owner-only Expo mobile app for managing `utahsands.com` and future property subdomains.

## What exists today

- Four-tab owner dashboard: Overview, Activity, Properties, Settings.
- One-click property switching and activity filters.
- Payment, message, maintenance, inspection, and lease event model.
- Sample **preview mode** requiring no account or live data.
- Supabase **owner-authenticated mode** (when configured), with owner-only property and event access.
- Properties can be created within the owner's account. Website creation and DNS setup are intentionally separate.
- Read / mark all read events, swipe-to-refresh, refresh after returning to app.
- Preference storage and opt-in phone push-token registration in a development build.
- Supabase schema with Row Level Security; clients cannot create verified payment events.

**Not yet active:** Real rental payments, incoming email ingestion, website maintenance submissions, server-generated push notifications, and tenant logins. No money changes hands in this app. The current website's resident forms are demos. Do not use sample events as accounting records.

## Development

Use Node 22.13+.

```bash
npm install
npm run typecheck
npm test
npm start
```

The app intentionally uses **Expo SDK 57**, not the newly released SDK 58, for a steadier development baseline. On iPhone, a development build may be needed if your App Store Expo Go does not support SDK 57. Push requires a development build on Android too.

To see demo mode, don't provide Supabase environment variables. The preview uses fictional values and resets at restart.

## Turn on private owner accounts

1. Create a Supabase project under your own account.
2. Run `supabase/schema.sql` in its SQL editor. Review permissions before production use.
3. Create the intended owner in Supabase Auth (email/password); do **not** expose public owner sign-up.
4. Create a local `.env` from `.env.example`:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

5. Restart Expo. The app now requires sign-in and loads owner-scoped properties/events. It does **not** populate fake events in real mode.

The publishable key is a public app configuration key protected by Row Level Security. **Never** put a Supabase service-role key, a Stripe secret, an email ingestion secret, or a tenant's credentials in `.env` or in Git.

## Future property sites

The current home uses `utahsands.com`. Additional properties can use hosts such as `second.utahsands.com`; the app validates these names and maps property records by ID. Adding a property does not create Cloudflare DNS, a public site, or a signed ingestion endpoint. The backend must verify hostname ownership before accepting events.

## Notifications

A signed-in owner can register a physical device in Settings after configuring an EAS project and installing a development build. This records an Expo push token in `owner_devices` with owner-only access.

**Registration is not push delivery.** A verified server-side event handler must send Expo push notifications, honor owner preferences, deduplicate events, and process delivery errors. See [integration plan](docs/INTEGRATION.md).

## Security boundaries

- Keep this repository free of private tenant information and credentials. It was public when created.
- Verified payments must arrive via payment-provider signature-checked webhooks, not user inputs or email claims.
- Tenant documents, inspections, and photos will require separate authenticated access rules.
- Production launch needs an end-to-end authorization, reliability, payments, and mobile QA pass.
- Nothing has been deployed to `utahsands.com`; no payment service or inbox has been connected.

## Status

Active development takes place on `feat/owner-app-foundation` as a reviewable pull request. Do not treat this as a released app.
