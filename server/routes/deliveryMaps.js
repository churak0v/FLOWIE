const express = require('express');
const { MapsError, mapConfig, suggest, geocode } = require('../services/yandexMaps');
const router = express.Router();

// Bounded process-local quotas; no persistence of address queries or provider responses.
const windows = new Map();
let globalWindow = { until: 0, count: 0 };
function quota(req, res, next) {
    const now = Date.now();
    for (const [key, entry] of windows) if (entry.until <= now) windows.delete(key);
    if (globalWindow.until <= now) globalWindow = { until: now + 60000, count: 0 };
    const key = req.ip || 'unknown';
    const entry = windows.get(key) || { until: now + 60000, count: 0 };
    if (entry.count >= 60 || globalWindow.count >= 600 || (!windows.has(key) && windows.size >= 5000)) {
        res.set('Retry-After', '60');
        return res.status(429).json({ ok: false, error: 'MAPS_RATE_LIMITED' });
    }
    entry.count += 1;
    globalWindow.count += 1;
    windows.set(key, entry);
    return next();
}
router.get('/map-config', (req, res) => res.json(mapConfig()));
function handler(operation, parameter) {
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');
        try { return res.json(await operation(req.query[parameter])); }
        catch (error) {
            return res.status(error instanceof MapsError ? error.status : 502)
                .json({ ok: false, error: error instanceof MapsError ? error.code : 'MAPS_PROVIDER_UNAVAILABLE' });
        }
    };
}
router.get('/suggest', quota, handler(suggest, 'q'));
router.get('/geocode', quota, handler(geocode, 'address'));
module.exports = router;
module.exports.quota = quota;
