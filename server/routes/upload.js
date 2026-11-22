const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateImageVariants } = require('../services/imageVariants');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const imageExtensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = imageExtensions[file.mimetype];
        const safeName = `${crypto.randomUUID()}${ext}`;
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024, files: 10, fields: 10, parts: 20 },
    fileFilter(req, file, cb) {
        if (imageExtensions[file.mimetype]) return cb(null, true);
        return cb(Object.assign(new Error('IMAGE_TYPE_NOT_ALLOWED'), { status: 415 }));
    },
});

async function verifyImages(req, res, next) {
    const files = req.files || (req.file ? [req.file] : []);
    try {
        for (const file of files) {
            const handle = await fs.promises.open(file.path, 'r');
            const bytes = Buffer.alloc(12);
            try { await handle.read(bytes, 0, 12, 0); } finally { await handle.close(); }
            const matches = {
                'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
                'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
                'image/gif': ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()),
                'image/webp': bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP',
            };
            if (!matches[file.mimetype]) throw Object.assign(new Error('INVALID_IMAGE_CONTENT'), { status: 415 });
        }
        // Generate immutable mobile-friendly versions once, never on GET requests.
        // Keep the original available even if a conversion fails.
        for (const file of files) {
            if (file.mimetype === 'image/gif') continue;
            try {
                const result = await generateImageVariants(file.path);
                console.info('[image-variants]', file.filename, result);
            } catch (error) {
                console.error('[image-variants] failure', file.filename, error.message);
            }
        }
        return next();
    } catch (err) {
        await Promise.all(files.map(file => fs.promises.unlink(file.path).catch(() => {})));
        return next(err);
    }
}

// Single file upload
router.post('/', upload.single('file'), verifyImages, (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        console.info('[upload] single', {
            name: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            ip: req.ip,
        });
    } catch {
        // ignore logging failures
    }

    const url = `/uploads/${req.file.filename}`;
    return res.json({ ok: true, url });
});

// Multiple file upload (optional)
router.post('/many', upload.array('files', 10), verifyImages, (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }
    try {
        console.info('[upload] many', {
            count: req.files.length,
            names: req.files.map((f) => f.originalname),
            sizes: req.files.map((f) => f.size),
            ip: req.ip,
        });
    } catch {
        // ignore
    }
    const urls = req.files.map(f => `/uploads/${f.filename}`);
    return res.json({ ok: true, urls });
});

router.use((err, req, res, next) => {
    if (!err) return next();
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 400;
    return res.status(status).json({ error: err.code || err.message || 'UPLOAD_FAILED' });
});

module.exports = router;
