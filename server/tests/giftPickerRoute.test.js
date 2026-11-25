'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sharp = require('sharp');
const router = require('../routes/giftPicker');

async function withServer(run) {
  router._test.clearRateLimits();
  const app = express();
  app.use((req, _res, next) => { req.user = { id: 77 }; next(); });
  app.use('/api/gift-picker', router);
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('private photo endpoint requires explicit consent and returns profile only', async () => {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f0d9c0' } }).png().toBuffer();
  await withServer(async (base) => {
    const deniedForm = new FormData();
    deniedForm.append('photo', new Blob([png], { type: 'image/png' }), 'private-name.png');
    deniedForm.append('consent', 'false');
    const denied = await fetch(`${base}/api/gift-picker/photo-profile`, { method: 'POST', headers: { origin: base }, body: deniedForm });
    assert.equal(denied.status, 400);
    assert.equal((await denied.json()).error, 'PHOTO_CONSENT_REQUIRED');

    const allowedForm = new FormData();
    allowedForm.append('photo', new Blob([png], { type: 'image/png' }), 'private-name.png');
    allowedForm.append('consent', 'true');
    const allowed = await fetch(`${base}/api/gift-picker/photo-profile`, { method: 'POST', headers: { origin: base }, body: allowedForm });
    assert.equal(allowed.status, 200);
    const body = await allowed.json();
    assert.deepEqual(Object.keys(body).sort(), ['ok', 'profile']);
    assert.equal(JSON.stringify(body).includes('private-name'), false);
    assert.deepEqual(Object.keys(body.profile).sort(), ['lightness', 'palette', 'tone', 'version']);
  });
});
