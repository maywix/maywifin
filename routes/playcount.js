const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Record a play (POST)
router.post('/:id', (req, res) => {
    const { id } = req.params;
    const { title, artist, album } = req.body;

    if (!title || !artist) {
        return res.status(400).json({ error: "Missing title or artist" });
    }

    try {
        const stmt = db.prepare(`
            INSERT INTO play_counts (id, title, artist, album, count, last_played)
            VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET 
                count = count + 1,
                last_played = CURRENT_TIMESTAMP,
                title = excluded.title,
                artist = excluded.artist,
                album = excluded.album
        `);
        stmt.run(id, title, artist, album || '');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Top Played overall
router.get('/top', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    try {
        const top = db.prepare("SELECT * FROM play_counts ORDER BY count DESC LIMIT ?").all(limit);
        res.json(top);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Top Played for a specific artist
router.get('/top/artist', (req, res) => {
    const artist = req.query.artist;
    const limit = parseInt(req.query.limit) || 10;
    
    if (!artist) return res.status(400).json({ error: "Missing artist parameter" });

    try {
        // Using LIKE to handle case insensitivity or partial matches safely
        const top = db.prepare("SELECT * FROM play_counts WHERE artist LIKE ? ORDER BY count DESC LIMIT ?").all(`%${artist}%`, limit);
        res.json(top);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
