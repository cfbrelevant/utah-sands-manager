import type { RequestKind } from './requests';

export type OwnerPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: 'owner-activity';
  data: { kind: RequestKind; propertyId: string };
};

// Never include contact information, email content, or the message itself
// in operating-system notifications, which may be visible on locked screens.
export function buildOwnerPushMessages(tokens: string[], propertyId: string, kind: RequestKind): OwnerPushMessage[] {
  const unique = [...new Set(tokens)].filter(t => /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(t)).slice(0, 20);
  return unique.map(to => ({
    to,
    title: kind === 'inquiry' ? 'New rental inquiry' : 'New maintenance report',
    body: 'A property request needs your review.',
    sound: 'default',
    channelId: 'owner-activity',
    data: { kind, propertyId },
  }));
}
