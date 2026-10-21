import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePropertyHost, parsePublicRequest, permittedOrigin } from '../supabase/functions/_shared/requests';

const valid = {
  propertyHost: 'utahsands.com', kind: 'inquiry', name: 'Test Applicant',
  email: 'person@example.net', subject: 'Rental question',
  message: 'Hello, can I schedule a tour?', website: '',
  submissionId: '1839fcc6-a9be-4206-ac62-176614992c61',
  turnstileToken: 'test-security-token'
};
test('valid inquiry is accepted with sanitized fields', () => {
  const parsed = parsePublicRequest({ ...valid, email: ' Person@EXAMPLE.NET ' });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.email, 'person@example.net');
});
test('hostnames reject spoofing and unrelated properties', () => {
  assert.equal(normalizePropertyHost('UTAHsands.COM'), 'utahsands.com');
  assert.equal(normalizePropertyHost('home.utahsands.com'), 'home.utahsands.com');
  for (const host of ['utahsands.com.evil.org','evilutahsands.com','.utahsands.com',
    'a..utahsands.com','http://utahsands.com','localhost','utahsands.com:443']) {
    assert.equal(normalizePropertyHost(host), null, host);
  }
});
test('CORS origins must be exactly the HTTPS property host', () => {
  assert.equal(permittedOrigin('https://utahsands.com', 'utahsands.com'), true);
  assert.equal(permittedOrigin('https://rental.utahsands.com', 'rental.utahsands.com'), true);
  for (const origin of ['http://utahsands.com','https://utahsands.com.evil.org',
    'https://utahsands.com:444','https://other.utahsands.com','null',
    'https://utahsands.com/path']) {
    assert.equal(permittedOrigin(origin, 'utahsands.com'), false, origin);
  }
});
test('rejects malformed or malicious submissions', () => {
  const invalid = [
    { kind: 'payment' }, { name: '<script>' }, { email: 'no-email' },
    { website: 'https://spam.example' }, { message: 'too short' },
    { subject: 'X'.repeat(141) }, { submissionId: 'invalid' },
    { turnstileToken: '' }, { propertyHost: 'evil.com' },
  ];
  for (const patch of invalid) {
    assert.equal(parsePublicRequest({ ...valid, ...patch }).ok, false, JSON.stringify(patch));
  }
});
test('kind maintenance allowed but not an authenticated tenant claim', () => {
  const result = parsePublicRequest({ ...valid, kind: 'maintenance' });
  assert.equal(result.ok, true);
});
