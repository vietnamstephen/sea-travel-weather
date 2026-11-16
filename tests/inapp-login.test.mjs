import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isInAppBrowser, platform } = require('../js/inapp-browser.js');

test('detects supported in-app browser user agents', () => {
  const uas = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.40',
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Zalo/24.02.01',
    'Mozilla/5.0 (iPhone) FBAN/FBIOS;FBAV/450.0',
    'Mozilla/5.0 (iPhone) Instagram 320.0.0.0.0',
    'Mozilla/5.0 (Linux; Android 13) Line/13.20.0',
    'Mozilla/5.0 (Linux; Android 13) TikTok 36.0.0',
    'Mozilla/5.0 (Linux; Android 13) musical_ly/36.0.0',
    'Mozilla/5.0 (Linux; Android 13) BytedanceWebview/1.0',
    'Mozilla/5.0 (Linux; Android 13; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36; wv)'
  ];
  for (const ua of uas) assert.equal(isInAppBrowser(ua), true, ua);
});

test('does not match regular desktop or mobile browsers', () => {
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
  ];
  for (const ua of uas) assert.equal(isInAppBrowser(ua), false, ua);
});

test('reports iOS and Android platforms', () => {
  assert.equal(platform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'ios');
  assert.equal(platform('Mozilla/5.0 (Linux; Android 14)'), 'android');
  assert.equal(platform('Mozilla/5.0 (Windows NT 10.0)'), 'other');
});

test('email code uses the required Supabase calls and supports successful verification', async () => {
  const calls = [];
  const client = { auth: {
    signInWithOtp: async value => { calls.push(['send', value]); return { data: {}, error: null }; },
    verifyOtp: async value => { calls.push(['verify', value]); return { data: { session: { user: { email: value.email } } }, error: null }; }
  } };
  await globalThis.SEA_INAPP.sendCode(client, 'person@example.com');
  const result = await globalThis.SEA_INAPP.verifyCode(client, 'person@example.com', '123456');
  assert.deepEqual(calls[0], ['send', { email: 'person@example.com', options: { shouldCreateUser: true } }]);
  assert.deepEqual(calls[1], ['verify', { email: 'person@example.com', token: '123456', type: 'email' }]);
  assert.equal(result.data.session.user.email, 'person@example.com');
});

test('email code errors distinguish wrong, expired, rate limit, and network failures', () => {
  const classify = globalThis.SEA_INAPP.classifyError;
  assert.equal(classify({ message: 'Token is invalid' }), 'wrong');
  assert.equal(classify({ code: 'otp_expired' }), 'expired');
  assert.equal(classify({ status: 429 }), 'rate');
  assert.equal(classify(new Error('Failed to fetch')), 'network');
});

test('resend cooldown counts down from 60 seconds', () => {
  const seconds = globalThis.SEA_INAPP.resendSeconds;
  assert.equal(seconds(61000, 1000), 60);
  assert.equal(seconds(1500, 1000), 1);
  assert.equal(seconds(1000, 1000), 0);
});
