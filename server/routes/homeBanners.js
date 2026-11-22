'use strict';
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { publicBanner } = require('../services/homeBanners');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (_req, res) => {
  try {
    const rows = await prisma.homeBanner.findMany({
      where: { isActive: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, heroSlides: rows.map(publicBanner) });
  } catch (error) {
    console.error('[home-banners] list failed', error?.message);
    return res.status(503).json({ ok: false, error: 'BANNERS_UNAVAILABLE' });
  }
});
module.exports = router;
