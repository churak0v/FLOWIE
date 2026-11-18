const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { DeliveryZoneError, resolveDeliveryPrice } = require('../services/deliveryZones');
const router = express.Router();
let prisma = new PrismaClient();
async function estimateDelivery(req, res) {
    const address = String(req.body?.address || '').trim();
    if (!address) return res.status(400).json({ ok: false, error: 'DELIVERY_DESTINATION_REQUIRED' });
    try {
        const quote = await resolveDeliveryPrice({ prisma, address });
        return res.json({ ok: true, ...quote, currency: 'RUB' });
    } catch (error) {
        return res.status(error instanceof DeliveryZoneError ? error.status : 500)
            .json({ ok: false, error: error instanceof DeliveryZoneError ? error.code : 'DELIVERY_ESTIMATE_FAILED' });
    }
}
router.post('/estimate', require('./deliveryMaps').quota, estimateDelivery);
module.exports = router;
module.exports._test = { estimateDelivery, setPrisma(value) { prisma = value; } };
