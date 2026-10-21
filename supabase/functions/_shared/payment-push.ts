type PaymentNoticeKind = 'received' | 'refunded';
export type PaymentPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: 'owner-activity';
  data: { propertyId: string; kind: 'payment' };
};

export function buildPaymentPushMessages(tokens: string[], propertyId: string, kind: PaymentNoticeKind): PaymentPushMessage[] {
  const unique = [...new Set(tokens)]
    .filter(token => /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token))
    .slice(0, 20);
  const title = kind === 'received' ? 'Rent payment confirmed' : 'Rent refund recorded';
  return unique.map(to => ({ to, title, body: 'View the transaction in Utah Sands Manager.',
    sound: 'default', channelId: 'owner-activity', data: { propertyId, kind: 'payment' } }));
}
