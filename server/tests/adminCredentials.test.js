const test = require('node:test');
const assert = require('node:assert/strict');
const {
  adminCredentialsConfigured,
  createAdminLoginLimiter,
  passwordHash,
  verifyAdminCredentials,
} = require('../services/adminCredentials');

test('admin password hashes are salted and verify login plus password', () => {
  const password = 'correct horse battery staple';
  const first = passwordHash(password);
  const second = passwordHash(password);
  assert.notEqual(first, second);
  assert.equal(verifyAdminCredentials({ login: 'Admin', password, expectedLogin: 'admin', encodedPasswordHash: first }), true);
  assert.equal(verifyAdminCredentials({ login: 'admin', password: 'wrong password value', expectedLogin: 'admin', encodedPasswordHash: first }), false);
  assert.equal(verifyAdminCredentials({ login: 'owner', password, expectedLogin: 'admin', encodedPasswordHash: first }), false);
});

test('malformed configuration fails closed', () => {
  assert.equal(adminCredentialsConfigured({ ADMIN_LOGIN: 'admin', ADMIN_PASSWORD_HASH: 'plain-text' }), false);
  assert.equal(verifyAdminCredentials({ login: 'admin', password: 'correct horse battery staple', expectedLogin: 'admin', encodedPasswordHash: '' }), false);
  assert.throws(() => passwordHash('too-short'), /BAD_ADMIN_PASSWORD/);
});

test('admin login limiter blocks repeated attempts and can reset after success', () => {
  let now = 0;
  const limiter = createAdminLoginLimiter({ max: 2, windowMs: 1000, now: () => now });
  assert.equal(limiter.consume('ip:admin').allowed, true);
  assert.equal(limiter.consume('ip:admin').allowed, true);
  assert.equal(limiter.consume('ip:admin').allowed, false);
  limiter.reset('ip:admin');
  assert.equal(limiter.consume('ip:admin').allowed, true);
  now = 2000;
  assert.equal(limiter.consume('ip:admin').allowed, true);
});
