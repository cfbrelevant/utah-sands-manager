export type ActivityKind = 'payment' | 'message' | 'maintenance' | 'inspection' | 'lease';
export type EventOrigin = 'demo' | 'verified';

export type Property = {
  id: string;
  name: string;
  address: string;
  location: string;
  host: string;
  state: 'preview' | 'planned' | 'active' | 'archived';
};

export type Activity = {
  id: string;
  propertyId: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  time: string;
  status: string;
  unread: boolean;
  needsAttention: boolean;
  origin: EventOrigin;
  amountCents?: number;
  submission?: {
    senderName: string;
    senderEmail: string;
    subject: string;
    message: string;
    status: string;
  };
};

export type KindFilter = 'all' | ActivityKind;

export function normalizeUtahSandsHost(input: string): string | null {
  const host = input.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
  if (host !== 'utahsands.com' && !host.endsWith('.utahsands.com')) return null;
  const parts = host.split('.');
  if (!parts.every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) return null;
  return host;
}

export function activitiesFor(events: Activity[], propertyId: string, kind: KindFilter): Activity[] {
  return events.filter(e => (propertyId === 'all' || e.propertyId === propertyId) &&
    (kind === 'all' || e.kind === kind));
}

export function unseenCount(events: Activity[], propertyId = 'all'): number {
  return activitiesFor(events, propertyId, 'all').filter(e => e.unread).length;
}

export function attentionCount(events: Activity[], propertyId = 'all'): number {
  return activitiesFor(events, propertyId, 'all').filter(e => e.needsAttention && e.unread).length;
}

export function sumRecordedPayments(events: Activity[], propertyId = 'all'): number {
  return activitiesFor(events, propertyId, 'payment')
    .filter(e => e.status === 'completed' && e.amountCents !== undefined)
    .reduce((sum, e) => sum + (e.amountCents ?? 0), 0);
}

export function formatUSD(cents: number): string {
  const dollars = (cents / 100).toFixed(2);
  return '$' + dollars.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
