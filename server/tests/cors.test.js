const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');
const { createCorsOriginCallback, isAllowedOrigin, normalizeOrigin } = require('../services/corsOrigins');

const production = {
  NODE_ENV: 'production',
  PUBLIC_SITE_URL: 'https://flowie.example/path',
  AUTH_ALLOWED_ORIGINS: 'https://admin.flowie.example, https://ops.flowie.example/',
};

test('production CORS allows configured storefront and admin origins', () => {
  assert.equal(isAllowedOrigin('https://flowie.example', production), true);
  assert.equal(isAllowedOrigin('https://admin.flowie.example', production), true);
  assert.equal(isAllowedOrigin('https://ops.flowie.example', production), true);
});

test('production CORS rejects arbitrary and malformed origins', () => {
  assert.equal(isAllowedOrigin('https://attacker.example', production), false);
  assert.equal(isAllowedOrigin('null', production), false);
  assert.equal(isAllowedOrigin('javascript:alert(1)', production), false);
  assert.equal(isAllowedOrigin('http://localhost:5173', production), false);
});

test('requests without Origin remain available for server-to-server clients', () => {
  assert.equal(isAllowedOrigin(undefined, production), true);
  assert.equal(isAllowedOrigin('', production), true);
});

test('loopback origins are allowed only outside production', () => {
  const development = { NODE_ENV: 'development', PUBLIC_SITE_URL: '', AUTH_ALLOWED_ORIGINS: '' };
  assert.equal(isAllowedOrigin('http://localhost:5173', development), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:6212', development), true);
  assert.equal(isAllowedOrigin('http://[::1]:3000', development), true);
});

test('CORS callback returns false instead of reflecting a denied origin', async () => {
  const callback = createCorsOriginCallback(production);
  const allowed = await new Promise((resolve, reject) => callback('https://flowie.example', (error, value) => error ? reject(error) : resolve(value)));
  const denied = await new Promise((resolve, reject) => callback('https://attacker.example', (error, value) => error ? reject(error) : resolve(value)));
  assert.equal(allowed, true);
  assert.equal(denied, false);
  assert.equal(normalizeOrigin('https://flowie.example/a?b=1'), 'https://flowie.example');
});

test('HTTP CORS emits credentials only for an allowed origin', async () => {
  const app = express();
  app.use(cors({ origin: createCorsOriginCallback(production), credentials: true }));
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}/ping`;
    const allowed = await fetch(base, { headers: { origin: 'https://flowie.example' } });
    const denied = await fetch(base, { headers: { origin: 'https://attacker.example' } });
    const serverToServer = await fetch(base);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://flowie.example');
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    assert.equal(denied.headers.get('access-control-allow-credentials'), null);
    assert.equal(serverToServer.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
