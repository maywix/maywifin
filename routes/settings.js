const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { verifyToken } = require('./auth');

// Get all settings
router.get('/', (req, res) => {
    try {
        const rows = db.prepare("SELECT * FROM settings").all();
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a setting
router.post('/', (req, res, next) => {
    const requireAuth = db.prepare("SELECT value FROM settings WHERE key = 'require_auth'").get()?.value;
    if (requireAuth === '1') {
        return verifyToken(req, res, next);
    }
    next();
}, (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "Missing key" });

    try {
        const requireAuth = db.prepare("SELECT value FROM settings WHERE key = 'require_auth'").get()?.value;
        if (requireAuth === '1') {
            const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.userId);
            if (!user?.is_admin) {
                return res.status(403).json({ error: "Admin only" });
            }
        }

        db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value || '');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
