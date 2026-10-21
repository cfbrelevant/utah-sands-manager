export type RequestKind = 'inquiry' | 'maintenance';
export type PublicRequest = {
  propertyHost: string;
  kind: RequestKind;
  name: string;
  email: string;
  subject: string;
  message: string;
  submissionId: string;
  turnstileToken: string;
  website: string;
};
export type ParseResult = { ok: true; value: PublicRequest } | { ok: false; reason: string };

export function normalizePropertyHost(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const host = raw.trim().toLowerCase();
  if (host !== 'utahsands.com' && !host.endsWith('.utahsands.com')) return null;
  if (host.length > 253) return null;
  if (!host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return host;
}
export function permittedOrigin(raw: string | null, propertyHost: string): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === propertyHost && url.port === '' &&
      url.pathname === '/' && !url.search && !url.hash && url.username === '' && url.password === '';
  } catch { return false; }
}
const asText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const emailOk = (value: string): boolean => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && value.length <= 254;

export function parsePublicRequest(body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'Invalid request.' };
  const input = body as Record<string, unknown>;
  const host = normalizePropertyHost(asText(input.propertyHost));
  const kind = asText(input.kind);
  const name = asText(input.name);
  const email = asText(input.email).toLowerCase();
  const subject = asText(input.subject);
  const message = asText(input.message);
  const submissionId = asText(input.submissionId);
  const token = asText(input.turnstileToken);
  const website = asText(input.website);
  if (website) return { ok: false, reason: 'Invalid request.' }; // honeypot
  if (!host) return { ok: false, reason: 'Unrecognized property.' };
  if (kind !== 'inquiry' && kind !== 'maintenance') return { ok: false, reason: 'Select an inquiry type.' };
  if (name.length < 2 || name.length > 100 || /[\r\n<>]/.test(name)) return { ok: false, reason: 'Enter your name.' };
  if (!emailOk(email)) return { ok: false, reason: 'Enter a valid email address.' };
  if (subject.length < 3 || subject.length > 140 || /[\r\n<>]/.test(subject)) return { ok: false, reason: 'Enter a subject (3–140 characters).' };
  if (message.length < 10 || message.length > 3000) return { ok: false, reason: 'Enter a message (10–3000 characters).' };
  if (!isUuid(submissionId)) return { ok: false, reason: 'Refresh this form and try again.' };
  if (token.length < 10 || token.length > 2048) return { ok: false, reason: 'Complete the security check.' };
  return { ok: true, value: { propertyHost: host, kind, name, email, subject, message, submissionId, turnstileToken: token, website: '' } };
}
