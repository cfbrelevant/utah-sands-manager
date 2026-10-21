// Public form ingress. Nothing is accepted without a server-validated Turnstile
// challenge issued for the verified property hostname. No tenant identity claims.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parsePublicRequest, permittedOrigin, normalizePropertyHost } from '../_shared/requests.ts';

const siteverify = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const allowedHeaders = 'content-type';

function response(status: number, data: Record<string, unknown>, origin?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = allowedHeaders;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  let originHost: string | null = null;
  try {
    if (origin) originHost = normalizePropertyHost(new URL(origin).hostname);
  } catch { /* Invalid origin. */ }
  const corsOrigin = originHost && permittedOrigin(origin, originHost) ? origin! : undefined;
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: corsOrigin ? 204 : 403,
      headers: corsOrigin ? {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': allowedHeaders,
        'Vary': 'Origin',
      } : { 'Vary': 'Origin' },
    });
  }
  if (req.method !== 'POST') return response(405, { error: 'Method not allowed.' }, corsOrigin);
  if (!corsOrigin) return response(403, { error: 'Origin not allowed.' });
  if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return response(415, { error: 'JSON required.' }, corsOrigin);
  }
  let body: unknown;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) return response(413, { error: 'Request too large.' }, corsOrigin);
    body = JSON.parse(raw);
  } catch { return response(400, { error: 'Malformed request.' }, corsOrigin); }
  const parsed = parsePublicRequest(body);
  if (!parsed.ok) return response(400, { error: parsed.reason }, corsOrigin);
  const request = parsed.value;
  if (!permittedOrigin(origin, request.propertyHost)) return response(403, { error: 'Invalid property origin.' }, corsOrigin);

  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  const salt = Deno.env.get('SUBMISSION_RATE_SALT');
  const url = Deno.env.get('SUPABASE_URL');
  const adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !salt || !url || !adminKey) {
    console.error('Submit form secrets/backend not configured.');
    return response(503, { error: 'Form temporarily unavailable.' }, corsOrigin);
  }

  // Turnstile responses are single-use and expire after five minutes.
  let verified: { success?: boolean; hostname?: string; action?: string } | null = null;
  try {
    const check = await fetch(siteverify, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        response: request.turnstileToken,
        idempotency_key: request.submissionId,
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!check.ok) throw new Error('Verification service error');
    verified = await check.json();
  } catch {
    return response(503, { error: 'Security check unavailable. Please retry.' }, corsOrigin);
  }
  if (!verified?.success || verified.hostname !== request.propertyHost || verified.action !== 'resident-request') {
    return response(403, { error: 'Security check failed. Please try again.' }, corsOrigin);
  }

  // Hash rate-limit key with secret salt: never write raw addresses into logs
  // or rate-limit records. Turnstile supplies the primary public anti-bot check.
  const bytes = new TextEncoder().encode(salt + ':' + request.propertyHost + ':' + request.email);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.rpc('record_site_submission', {
    p_host: request.propertyHost,
    p_kind: request.kind,
    p_name: request.name,
    p_email: request.email,
    p_subject: request.subject,
    p_message: request.message,
    p_client_submission_id: request.submissionId,
    p_fingerprint: fingerprint,
  });
  if (error) {
    if (error.message.includes('rate_limited')) return response(429, { error: 'Too many requests. Try again later.' }, corsOrigin);
    if (error.message.includes('not_accepting_requests')) return response(404, { error: 'This property is not accepting requests.' }, corsOrigin);
    console.error('Request ingestion failed', error.code);
    return response(503, { error: 'Unable to send this request. Please try again.' }, corsOrigin);
  }
  return response(202, { ok: true, message: 'Request received. This is not an emergency service.' }, corsOrigin);
});
