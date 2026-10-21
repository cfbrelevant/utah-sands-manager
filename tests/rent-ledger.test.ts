import test from 'node:test';
import assert from 'node:assert/strict';
import { netConfirmedRentCents, type RentLedgerEntry } from '../src/domain';

const entries: RentLedgerEntry[] = [
  { paymentIntentId: 'pi_a', propertyId: 'haviture', receivedCents: 120000, refundedCents: 0,
    currency: 'usd', confirmedAt: '2026-10-21T17:00:00Z' },
  { paymentIntentId: 'pi_b', propertyId: 'haviture', receivedCents: 90000, refundedCents: 25000,
    currency: 'usd', confirmedAt: '2026-10-21T17:00:00Z' },
  { paymentIntentId: 'pi_c', propertyId: 'other', receivedCents: 60000, refundedCents: 60000,
    currency: 'usd', confirmedAt: '2026-10-21T17:00:00Z' },
  { paymentIntentId: 'pi_d', propertyId: 'haviture', receivedCents: 0, refundedCents: 1000,
    currency: 'usd', confirmedAt: null },
];

test('one row per payment, refunds reduce the net and pending never counts', () => {
  assert.equal(netConfirmedRentCents(entries), 185000);
  assert.equal(netConfirmedRentCents(entries, 'haviture'), 185000);
  assert.equal(netConfirmedRentCents(entries, 'other'), 0);
  assert.equal(netConfirmedRentCents(entries, 'unknown'), 0);
});
test('totals never become negative if a refund arrives before success', () => {
  const [row] = entries.slice(0,1);
  assert.equal(netConfirmedRentCents([{...row, refundedCents: 150000}]), 0);
});
