import test from 'node:test';
import assert from 'node:assert/strict';
import { activitiesFor, attentionCount, normalizeUtahSandsHost, sumRecordedPayments, unseenCount, formatUSD } from '../src/domain';
import { SAMPLE_EVENTS } from '../src/sample';

test('accepts only utahsands.com hosts, not lookalikes', () => {
  assert.equal(normalizeUtahSandsHost('HTTPS://Haviture.UtahSands.com/path'), 'haviture.utahsands.com');
  assert.equal(normalizeUtahSandsHost('utahsands.com'), 'utahsands.com');
  assert.equal(normalizeUtahSandsHost('attacker.utahsands.com.evil.org'), null);
  assert.equal(normalizeUtahSandsHost('bad..utahsands.com'), null);
  assert.equal(normalizeUtahSandsHost('otherdomain.com'), null);
});

test('scope filters events by property and kind', () => {
  assert.equal(activitiesFor(SAMPLE_EVENTS, 'haviture', 'payment').length, 1);
  assert.equal(activitiesFor(SAMPLE_EVENTS, 'missing', 'all').length, 0);
  assert.equal(activitiesFor(SAMPLE_EVENTS, 'all', 'message').length, 1);
});

test('unread and actionable counts differ', () => {
  assert.equal(unseenCount(SAMPLE_EVENTS), 3);
  assert.equal(attentionCount(SAMPLE_EVENTS), 2);
  const marked = SAMPLE_EVENTS.map(e => e.id === 'example-1' ? { ...e, unread: false } : e);
  assert.equal(attentionCount(marked), 1);
});

test('only completed payments count toward display total', () => {
  const pending = { ...SAMPLE_EVENTS[2], id: 'pending', status: 'pending', amountCents: 99999 };
  assert.equal(sumRecordedPayments([...SAMPLE_EVENTS, pending]), 120000);
  assert.equal(formatUSD(120000), '$1,200.00');
  assert.equal(formatUSD(1299999), '$12,999.99');
});
