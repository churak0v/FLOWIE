const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

function normalizeString(v) {
    const s = v == null ? '' : String(v);
    const trimmed = s.trim();
    return trimmed ? trimmed : null;
}

function normalizeBoolean(v) {
    if (v === true) return true;
    if (v === false) return false;
    if (v == null) return null;
    const s = String(v).toLowerCase().trim();
    if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
    return null;
}

function serializeRecipient(r) {
    if (!r) return null;
    return {
        id: r.id,
        userId: r.userId,
        name: r.name,
        relation: r.relation,
        phone: r.phone,
        address: r.address,
        birthDate: r.birthDate,
        askAddress: Boolean(r.askAddress),
        image: r.image,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
    };
}

// GET /api/recipients
router.get('/', requireAuth, async (req, res) => {
    try {
        const items = await prisma.recipient.findMany({
            where: { userId: req.user.id },
            orderBy: { updatedAt: 'desc' },
        });
        return res.json({ ok: true, recipients: items.map(serializeRecipient) });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'RECIPIENTS_LOAD_FAILED' });
    }
});

// POST /api/recipients
router.post('/', requireAuth, async (req, res) => {
    try {
        const name = normalizeString(req.body?.name);
        if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

        const relation = normalizeString(req.body?.relation);
        const phone = normalizeString(req.body?.phone);
        const address = normalizeString(req.body?.address);
        const birthDate = normalizeString(req.body?.birthDate);
        const image = normalizeString(req.body?.image);
        const askAddress = normalizeBoolean(req.body?.askAddress);

        const recipient = await prisma.recipient.create({
            data: {
                userId: req.user.id,
                name,
                relation,
                phone,
                address,
                birthDate,
                image,
                ...(askAddress != null ? { askAddress } : {}),
            },
        });

        return res.json({ ok: true, recipient: serializeRecipient(recipient) });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'RECIPIENT_CREATE_FAILED' });
    }
});

// PATCH /api/recipients/:id
router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

        const existing = await prisma.recipient.findUnique({ where: { id } });
        if (!existing || existing.userId !== req.user.id) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

        const patch = {};
        if (req.body?.name != null) patch.name = normalizeString(req.body.name) || existing.name;
        if (req.body?.relation !== undefined) patch.relation = normalizeString(req.body.relation);
        if (req.body?.phone !== undefined) patch.phone = normalizeString(req.body.phone);
        if (req.body?.address !== undefined) patch.address = normalizeString(req.body.address);
        if (req.body?.birthDate !== undefined) patch.birthDate = normalizeString(req.body.birthDate);
        if (req.body?.image !== undefined) patch.image = normalizeString(req.body.image);
        if (req.body?.askAddress !== undefined) {
            const b = normalizeBoolean(req.body.askAddress);
            if (b != null) patch.askAddress = b;
        }

        const recipient = await prisma.recipient.update({
            where: { id },
            data: patch,
        });

        return res.json({ ok: true, recipient: serializeRecipient(recipient) });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'RECIPIENT_UPDATE_FAILED' });
    }
});

// DELETE /api/recipients/:id
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });

        const existing = await prisma.recipient.findUnique({ where: { id } });
        if (!existing || existing.userId !== req.user.id) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

        // Best-effort "active obligations" guard: block deletion while the user has active orders.
        const active = await prisma.order.findFirst({
            where: {
                userId: req.user.id,
                status: { in: ['new', 'paid', 'delivery'] },
            },
            select: { id: true },
        });
        if (active) return res.status(409).json({ ok: false, error: 'ACTIVE_ORDERS' });

        await prisma.recipient.delete({ where: { id } });
        return res.json({ ok: true });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e?.message || 'RECIPIENT_DELETE_FAILED' });
    }
});

module.exports = router;

