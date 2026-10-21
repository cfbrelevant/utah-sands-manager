import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStripeRentEvent } from '../supabase/functions/_shared/stripe-rent';
import { buildPaymentPushMessages } from '../supabase/functions/_shared/payment-push';

const succeeded = {
  id: 'evt_a1',
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_a1', status: 'succeeded', amount_received: 120000,
    currency: 'usd', metadata: { property_id: 'attacker-picked-property' } } }
};

test('only succeeded payment intents become confirmed rent events', () => {
  assert.deepEqual(parseStripeRentEvent(succeeded), {
    eventId: 'evt_a1', paymentIntentId: 'pi_a1', kind: 'succeeded',
    amountCents: 120000, currency: 'usd',
  });
  for (const status of ['processing','requires_action','requires_payment_method']) {
    assert.equal(parseStripeRentEvent({...succeeded, data: {
      object: {...succeeded.data.object, status } }}), null);
  }
  assert.equal(parseStripeRentEvent({ ...succeeded, type: 'checkout.session.completed' }), null);
});
test('never map an event to the payer-supplied property metadata', () => {
  const got = parseStripeRentEvent(succeeded);
  assert.ok(got && !('propertyId' in got));
});
test('refund snapshots report cumulative amount, not original charge', () => {
  const refund = { id: 'evt_ref1', type: 'charge.refunded', data: {
    object: { id: 'ch_1', payment_intent: 'pi_a1', amount_refunded: 25000,
      amount: 120000, currency: 'usd' } } };
  assert.deepEqual(parseStripeRentEvent(refund), {
    eventId: 'evt_ref1', paymentIntentId: 'pi_a1', kind: 'refunded',
    amountCents: 25000, currency: 'usd',
  });
  assert.equal(parseStripeRentEvent({ ...refund, data: {
    object: { ...refund.data.object, amount_refunded: 0 } } }), null);
});
test('reject invalid amounts and currencies', () => {
  for (const amount of [-10,0,1.5,NaN,Infinity]) {
    assert.equal(parseStripeRentEvent({ ...succeeded, data: { object: {
      ...succeeded.data.object, amount_received: amount } } }), null);
  }
  assert.equal(parseStripeRentEvent({ ...succeeded, data: { object: {
    ...succeeded.data.object, currency: 'eur' } } }), null);
});
test('private lock-screen notifications omit amounts and tenant details', () => {
  const msgs = buildPaymentPushMessages([
    'ExpoPushToken[a1-9]', 'ExpoPushToken[a1-9]', 'not-a-push-token'
  ], 'prop-1', 'received');
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].title, 'Rent payment confirmed');
  assert.ok(!JSON.stringify(msgs).includes('120000'));
  assert.equal(msgs[0].data.propertyId, 'prop-1');
});
