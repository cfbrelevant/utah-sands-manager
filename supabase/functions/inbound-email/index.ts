// Receives only Cloudflare-Worker-signed metadata, not raw email body or attachments.
// The SMTP sender's identity is UNVERIFIED and must not be treated as tenant auth.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseEmailRelay, verifyEmailRelay } from '../_shared/email-signing.ts';

const json = (status: number, payload: Record<string, unknown>) =>
  Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });

Deno.serve(async request => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const secret = Deno.env.get('EMAIL_BRIDGE_HMAC_SECRET');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !url || !key) return json(503, { error: 'Email alerts unavailable' });
  let raw: string;
  try {
    raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return json(413, { error: 'Too large' });
  } catch { return json(400, { error: 'Invalid body' }); }
  const approved = await verifyEmailRelay(secret,
    request.headers.get('x-utahsands-timestamp'), raw,
    request.headers.get('x-utahsands-signature'));
  if (!approved) return json(401, { error: 'Invalid sender authentication' });
  let parsed;
  try { parsed = parseEmailRelay(JSON.parse(raw)); }
  catch { return json(400, { error: 'Malformed request' }); }
  if (!parsed) return json(400, { error: 'Invalid metadata' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc('record_inbound_email', {
    p_recipient: parsed.recipient, p_sender: parsed.sender,
    p_subject: parsed.subject, p_message_key: parsed.messageKey,
  });
  if (error) {
    // No personal data in logs. Absent alias should not be auto-provisioned.
    console.error('Inbound email storage error', error.code);
    return json(503, { error: 'Unable to record email' });
  }
  // Push delivery is optional. Never include subjects or sender email addresses
  // on a device lock-screen; emails still reach the forwarded inbox first.
  if (data?.recorded === true && Deno.env.get('EXPO_ACCESS_TOKEN')) {
    try {
      const { data: property } = await admin.from('properties')
        .select('owner_id').eq('id', data.property_id).maybeSingle();
      if (property) {
        const { data: prefs } = await admin.from('owner_preferences')
          .select('alert_messages').eq('owner_id', property.owner_id).maybeSingle();
        if (prefs?.alert_messages !== false) {
          const { data: devices } = await admin.from('owner_devices')
            .select('expo_push_token').eq('owner_id', property.owner_id).limit(20);
          const messages = [...new Set((devices ?? []).map(d => d.expo_push_token))]
            .filter(t => /^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$/.test(t))
            .map(to => ({
              to, title: 'New property email', body: 'Open Utah Sands Manager to review.',
              sound: 'default', channelId: 'owner-activity',
              data: { propertyId: data.property_id, kind: 'message' },
            }));
          if (messages.length) {
            const response = await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'content-type': 'application/json',
                authorization: 'Bearer ' + Deno.env.get('EXPO_ACCESS_TOKEN') },
              body: JSON.stringify(messages), signal: AbortSignal.timeout(4000),
            });
            if (!response.ok) console.error('Email alert push rejected', response.status);
          }
        }
      }
    } catch { console.error('Nonfatal email alert push failure'); }
  }
  return json(200, { received: true });
});
