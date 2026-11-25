'use strict';

const express = require('express');
const multer = require('multer');
const { requireAuth, requireSameOrigin } = require('../middleware/auth');
const { analyzeGiftPickerPhoto } = require('../services/giftPickerPhoto');

const router = express.Router();
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const buckets = new Map();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2, parts: 3 },
  fileFilter(_req, file, done) {
    if (ALLOWED_TYPES.has(String(file.mimetype || '').toLowerCase())) return done(null, true);
    return done(Object.assign(new Error('PHOTO_TYPE_NOT_ALLOWED'), { code: 'PHOTO_TYPE_NOT_ALLOWED', status: 415 }));
  },
});

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = `${req.user?.id || 'guest'}:${String(req.ip || '').slice(0, 80)}`;
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    buckets.set(key, { startedAt: now, count: 1 });
    return next();
  }
  current.count += 1;
  if (current.count <= 6) return next();
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil((60_000 - (now - current.startedAt)) / 1000))));
  return res.status(429).json({ ok: false, error: 'PHOTO_RATE_LIMITED' });
}

router.post('/photo-profile', requireSameOrigin, requireAuth, rateLimit, upload.single('photo'), async (req, res) => {
  try {
    if (String(req.body?.consent || '') !== 'true') {
      if (Buffer.isBuffer(req.file?.buffer)) req.file.buffer.fill(0);
      if (req.file) req.file.buffer = null;
      return res.status(400).json({ ok: false, error: 'PHOTO_CONSENT_REQUIRED' });
    }
    if (!req.file?.buffer) return res.status(400).json({ ok: false, error: 'PHOTO_REQUIRED' });
    const profile = await analyzeGiftPickerPhoto(req.file.buffer);
    req.file.buffer = null;
    return res.json({ ok: true, profile });
  } catch (error) {
    if (Buffer.isBuffer(req.file?.buffer)) req.file.buffer.fill(0);
    if (req.file) req.file.buffer = null;
    return res.status(error?.status || 500).json({ ok: false, error: error?.code || 'PHOTO_PROCESSING_FAILED' });
  }
});

router.use((error, req, res, _next) => {
  if (Buffer.isBuffer(req.file?.buffer)) req.file.buffer.fill(0);
  const status = error?.code === 'LIMIT_FILE_SIZE' ? 413 : (error?.status || 400);
  return res.status(status).json({ ok: false, error: error?.code || 'PHOTO_UPLOAD_FAILED' });
});

module.exports = router;
module.exports._test = { clearRateLimits: () => buckets.clear() };
