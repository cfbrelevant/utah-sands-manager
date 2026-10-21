// Cloudflare Email Routing Worker. Not deployed. Change the email routing rule
// only AFTER verifying forwarding so existing messages cannot be lost.
import { signEmailRelay } from '../supabase/functions/_shared/email-signing.ts';

type Envelope = {
  from: string;
  to: string;
  headers: Headers;
  forward(address: string): Promise<unknown>;
};
type Env = {
  EMAIL_FORWARD_TO: string;        // Verified destination, configured as a Worker secret
  EMAIL_BRIDGE_ENDPOINT: string;    // Public Supabase Edge URL, not a credential
  EMAIL_BRIDGE_HMAC_SECRET: string; // Secret, same as on the Edge function
};
type Context = { waitUntil(promise: Promise<unknown>): void };
const enc = new TextEncoder();

async function hashMessage(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

async function notify(message: Envelope, env: Env): Promise<void> {
  if (!env.EMAIL_BRIDGE_ENDPOINT || !env.EMAIL_BRIDGE_HMAC_SECRET) return;
  const endpoint = new URL(env.EMAIL_BRIDGE_ENDPOINT);
  if (endpoint.protocol !== 'https:') throw new Error('Email bridge endpoint must use HTTPS');
  const recipient = message.to.trim().toLowerCase();
  const sender = message.from.trim().toLowerCase();
  const subject = (message.headers.get('subject') || '').trim().slice(0, 180);
  const headerId = message.headers.get('message-id') || crypto.randomUUID();
  // Hash includes the destination so repeated message IDs to separate
  // property inboxes are independent. The raw MIME message is not uploaded.
  const messageKey = await hashMessage(recipient + '\n' + sender + '\n' + headerId);
  const body = JSON.stringify({ recipient, sender, subject, messageKey });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signEmailRelay(env.EMAIL_BRIDGE_HMAC_SECRET, timestamp, body);
  const reply = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json',
      'x-utahsands-timestamp': timestamp, 'x-utahsands-signature': signature },
    body, signal: AbortSignal.timeout(6000),
  });
  if (!reply.ok) throw new Error('Email bridge notification failed');
}

export default {
  async email(message: Envelope, env: Env, ctx: Context): Promise<void> {
    // Forward FIRST so an alert failure cannot silently consume the email.
    // The destination must already be a verified Cloudflare Email Routing address.
    if (!env.EMAIL_FORWARD_TO) throw new Error('Verified forwarding destination not configured');
    await message.forward(env.EMAIL_FORWARD_TO);
    ctx.waitUntil(notify(message, env).catch(() => {
      // Intentionally do not log subjects, sender identities, or message contents.
      console.error('Owner email alert could not be delivered; email forwarding succeeded');
    }));
  },
};
