const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '';
        const safeName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
        cb(null, safeName);
    }
});

const upload = multer({ storage });

// Single file upload
router.post('/', upload.single('file'), (req, res) => {
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
router.post('/many', upload.array('files', 10), (req, res) => {
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

module.exports = router;
