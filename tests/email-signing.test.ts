import test from 'node:test';
import assert from 'node:assert/strict';
import { signEmailRelay, verifyEmailRelay, parseEmailRelay } from '../supabase/functions/_shared/email-signing';

test('valid HMAC signed metadata is accepted once within 5 minute clock window', async () => {
  const time = 1792612800;
  const raw = '{"recipient":"support@utahsands.com"}';
  const secret = 'a-long-test-secret-not-for-production';
  const signed = await signEmailRelay(secret, String(time), raw);
  assert.equal(await verifyEmailRelay(secret,String(time),raw,signed,time),true);
  assert.equal(await verifyEmailRelay(secret,String(time),raw,signed,time+301),false);
  assert.equal(await verifyEmailRelay(secret,String(time),raw,signed,time-301),false);
  assert.equal(await verifyEmailRelay('wrong',String(time),raw,signed,time),false);
  assert.equal(await verifyEmailRelay(secret,String(time),raw+' ',signed,time),false);
  assert.equal(await verifyEmailRelay(secret,String(time),raw,'0'.repeat(64),time),false);
});
test('accepts only UtahSands recipient metadata and valid envelope fields', () => {
  const correct={recipient:'Support@UTAHsands.COM',sender:'person@example.net',
    subject:'Rental availability',messageKey:'a'.repeat(64)};
  assert.deepEqual(parseEmailRelay(correct),{...correct,recipient:'support@utahsands.com'});
  for (const patch of [
    { recipient: 'support@utahsands.com.evil.com' }, { recipient: 'support@elsewhere.net' },
    { sender: 'invalid' }, { subject: 'hello\r\nInjected: yes' },
    { messageKey: 'notahash' }
  ]) assert.equal(parseEmailRelay({...correct,...patch}),null);
});
