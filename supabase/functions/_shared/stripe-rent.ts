// Pure, independently testable snapshot parser. Never trust request metadata
// to assign a payment to an owner; the DB has server-created PI bindings.
export type RentEvent = {
  eventId: string;
  paymentIntentId: string;
  kind: 'succeeded' | 'refunded';
  amountCents: number;
  currency: 'usd';
};

type LooseStripeEvent = {
  id?: unknown;
  type?: unknown;
  data?: { object?: unknown };
};
const isId = (value: unknown, prefix: string): value is string =>
  typeof value === 'string' && new RegExp('^' + prefix + '[A-Za-z0-9_]+$').test(value);
const cents = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function parseStripeRentEvent(input: LooseStripeEvent): RentEvent | null {
  if (!isId(input.id, 'evt_') || !isRecord(input.data?.object)) return null;
  const payment = input.data.object;
  if (payment.currency !== 'usd') return null;
  if (input.type === 'payment_intent.succeeded') {
    if (!isId(payment.id,'pi_') || payment.status !== 'succeeded' || !cents(payment.amount_received)) return null;
    return { eventId: input.id, paymentIntentId: payment.id, kind: 'succeeded',
      amountCents: payment.amount_received, currency: 'usd' };
  }
  if (input.type === 'charge.refunded') {
    // charge.refunded supplies cumulative amount_refunded, including partials.
    if (!isId(payment.payment_intent,'pi_') || !cents(payment.amount_refunded)) return null;
    return { eventId: input.id, paymentIntentId: payment.payment_intent,
      kind: 'refunded', amountCents: payment.amount_refunded, currency: 'usd' };
  }
  return null;
}
