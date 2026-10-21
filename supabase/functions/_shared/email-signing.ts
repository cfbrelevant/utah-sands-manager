// Compatible with Cloudflare Workers, Deno Edge Functions, and Node WebCrypto.
// The shared secret MUST stay in server-only environment bindings.
const encoder = new TextEncoder();
const validHex = (value: string) => /^[a-f0-9]{64}$/.test(value);
const toHex = (array: Uint8Array): string =>
  Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (value: string): Uint8Array =>
  new Uint8Array(value.match(/.{2}/g)!.map(pair => parseInt(pair, 16)));

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), {
    name: 'HMAC', hash: 'SHA-256',
  }, false, ['sign', 'verify']);
}

export async function signEmailRelay(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await hmacKey(secret);
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(timestamp + '.' + body));
  return toHex(new Uint8Array(signed));
}

export async function verifyEmailRelay(
  secret: string, timestamp: string | null, body: string,
  signature: string | null, nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  if (!timestamp || !signature || !/^\d{10}$/.test(timestamp) || !validHex(signature) || !secret) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(nowSeconds - seconds) > 300) return false;
  const key = await hmacKey(secret);
  return crypto.subtle.verify('HMAC', key, fromHex(signature), encoder.encode(timestamp + '.' + body));
}

export type EmailRelay = { recipient: string; sender: string; subject: string; messageKey: string };

export function parseEmailRelay(body: unknown): EmailRelay | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const recipient = typeof value.recipient === 'string' ? value.recipient.trim().toLowerCase() : '';
  const sender = typeof value.sender === 'string' ? value.sender.trim().toLowerCase() : '';
  const subject = typeof value.subject === 'string' ? value.subject.trim() : '';
  const messageKey = typeof value.messageKey === 'string' ? value.messageKey : '';
  const validAlias = /^[a-z0-9._+-]{1,64}@(?:[a-z0-9-]+\.)*utahsands\.com$/.test(recipient);
  const validSender = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender) && sender.length <= 254;
  if (!validAlias || !validSender || subject.length > 180 ||
      /[\r\n<>]/.test(subject) || !validHex(messageKey)) return null;
  return { recipient, sender, subject: subject || '(No subject)', messageKey };
}
