import { Activity, Property } from './domain';

export const ORIGINAL_PROPERTY: Property = {
  id: 'haviture',
  name: 'Haviture at Daybreak',
  address: '11184 S Haviture Rd',
  location: 'South Jordan, Utah 84009',
  host: 'utahsands.com',
  state: 'preview',
};

// Completely fictional items. NEVER treat them as real payments or tenant messages.
export const SAMPLE_EVENTS: Activity[] = [
  {
    id: 'example-1', propertyId: 'haviture', kind: 'message',
    title: 'New rental question', detail: 'Example: Is the home available for a tour?',
    time: 'Sample event', status: 'unanswered', unread: true,
    needsAttention: true, origin: 'demo',
  },
  {
    id: 'example-2', propertyId: 'haviture', kind: 'maintenance',
    title: 'Maintenance request', detail: 'Example: Kitchen faucet is dripping.',
    time: 'Sample event', status: 'open', unread: true,
    needsAttention: true, origin: 'demo',
  },
  {
    id: 'example-3', propertyId: 'haviture', kind: 'payment',
    title: 'Rent payment completed', detail: 'Illustrative payment — no money received.',
    time: 'Sample event', status: 'completed', unread: true,
    needsAttention: false, origin: 'demo', amountCents: 120000,
  },
  {
    id: 'example-4', propertyId: 'haviture', kind: 'inspection',
    title: 'Move-in checklist submitted', detail: 'Example: 2 rooms flagged for review.',
    time: 'Sample event', status: 'review', unread: false,
    needsAttention: true, origin: 'demo',
  },
];
