import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerPushMessages } from '../supabase/functions/_shared/push';

test('push messages contain only generic notice and property routing id', () => {
  const msg = buildOwnerPushMessages(['ExpoPushToken[abc123_4]'], 'property-id', 'maintenance');
  assert.equal(msg.length, 1);
  assert.deepEqual(msg[0], {
    to: 'ExpoPushToken[abc123_4]', title: 'New maintenance report',
    body: 'A property request needs your review.', sound: 'default',
    channelId: 'owner-activity', data: { kind: 'maintenance', propertyId: 'property-id' },
  });
  assert.ok(!JSON.stringify(msg).includes('tenant@example'));
});

test('rejects invalid tokens, caps devices and deduplicates', () => {
  const tokens = Array.from({ length: 30 }, (_, i) => 'ExponentPushToken[owner' + i + ']');
  const result = buildOwnerPushMessages([...tokens, tokens[0], 'not-a-token'], 'prop', 'inquiry');
  assert.equal(result.length, 20);
  assert.equal(new Set(result.map(m => m.to)).size, 20);
});
