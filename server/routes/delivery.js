
const express = require('express');
const router = express.Router();

// POST /api/delivery/estimate
// Mock Yandex Go estimation
router.post('/estimate', async (req, res) => {
    try {
        const { address, coords } = req.body;

        // Mock logic: 
        // 1. If coords provided, calc distance (mock).
        // 2. Return random price between 300 and 600.

        const mockPrice = Math.floor(Math.random() * (600 - 300 + 1)) + 300;

        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 500));

        res.json({
            price: mockPrice,
            eta: '45 min',
            provider: 'yandex_go'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
