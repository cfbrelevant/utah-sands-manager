// Only Stripe-signed events are accepted; payment -> property mapping comes
// ONLY from trusted server-registered payment_intent bindings in the database.
import Stripe from 'npm:stripe@^22';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseStripeRentEvent } from '../_shared/stripe-rent.ts';
import { buildPaymentPushMessages } from '../_shared/payment-push.ts';

const json = (status: number, payload: Record<string, unknown>) =>
  Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });

Deno.serve(async req => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const signature = req.headers.get('stripe-signature');
  if (!signature) return json(400, { error: 'Signature required' });
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET');
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const expectedMode = Deno.env.get('STRIPE_EXPECT_LIVEMODE');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !stripeKey || !url || !serviceKey ||
      (expectedMode !== 'true' && expectedMode !== 'false')) {
    console.error('Stripe webhook not configured');
    return json(503, { error: 'Webhook unavailable' });
  }
  let raw: string;
  try {
    raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 262144) return json(413, { error: 'Payload too large' });
  } catch { return json(400, { error: 'Invalid request body' }); }

  let stripeEvent: Stripe.Event;
  try {
    const stripe = new Stripe(stripeKey);
    stripeEvent = await stripe.webhooks.constructEventAsync(
      raw, signature, webhookSecret, 300, Stripe.createSubtleCryptoProvider()
    );
  } catch {
    // Do not echo headers/body/secrets or their expected values.
    return json(400, { error: 'Invalid Stripe signature' });
  }
  if (stripeEvent.livemode !== (expectedMode === 'true') || stripeEvent.account) {
    return json(400, { error: 'Unexpected Stripe account mode' });
  }

  // Ignore unrelated payment events. No payment is credited from an
  // initiated checkout, pending payment or non-terminal charge event.
  const parsed = parseStripeRentEvent(stripeEvent);
  if (!parsed) return json(200, { received: true, ignored: true });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc('record_stripe_rent_event', {
    p_event_id: parsed.eventId,
    p_payment_intent_id: parsed.paymentIntentId,
    p_event_kind: parsed.kind,
    p_amount_cents: parsed.amountCents,
    p_currency: parsed.currency,
  });
  if (error) {
    // Unknown payment intents should be retried after the server creates its
    // mapping; never auto-bind based on payer-controlled Stripe metadata.
    console.error('Stripe payment ingestion failed', error.code);
    return json(503, { error: 'Payment could not be recorded' });
  }
  // A stored payment is authoritative even if best-effort push fails.
  // Never include tenant identity, amount, or payment IDs on lock screens.
  if (data?.recorded === true && Deno.env.get('EXPO_ACCESS_TOKEN')) {
    try {
      const propertyId = data.property_id as string;
      const { data: property } = await admin.from('properties')
        .select('owner_id').eq('id', propertyId).maybeSingle();
      if (property) {
        const { data: prefs } = await admin.from('owner_preferences')
          .select('alert_payments').eq('owner_id', property.owner_id).maybeSingle();
        if (prefs?.alert_payments !== false) {
          const { data: devices } = await admin.from('owner_devices')
            .select('expo_push_token').eq('owner_id', property.owner_id).limit(20);
          const messages = buildPaymentPushMessages(
            (devices ?? []).map(item => item.expo_push_token),
            propertyId, data.kind === 'refunded' ? 'refunded' : 'received'
          );
          if (messages.length) {
            const res = await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + Deno.env.get('EXPO_ACCESS_TOKEN') },
              body: JSON.stringify(messages), signal: AbortSignal.timeout(4000),
            });
            if (!res.ok) console.error('Push service rejected rent alert', res.status);
          }
        }
      }
    } catch { console.error('Nonfatal rent push failure'); }
  }
  return json(200, { received: true });
});
