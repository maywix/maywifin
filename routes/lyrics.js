const express = require('express');
const router = express.Router();

// LrcLib API wrapper
router.get('/', async (req, res) => {
    const { track_name, artist_name, album_name, duration } = req.query;

    if (!track_name || !artist_name) {
        return res.status(400).json({ error: "Missing track_name or artist_name" });
    }

    try {
        // Build query for LRCLIB API
        const params = new URLSearchParams({
            track_name,
            artist_name
        });
        
        if (album_name) params.append('album_name', album_name);
        if (duration) params.append('duration', duration);

        // Fetch using dynamic import for node-fetch (since fetch is native in Node 18+ anyway, but we'll use native fetch)
        const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
            headers: {
                'User-Agent': 'MayWiFin/1.0.0 (https://github.com/maywix/maywifin)'
            }
        });

        if (response.status === 404) {
            return res.status(404).json({ error: "Lyrics not found" });
        }

        if (!response.ok) {
            throw new Error(`LRCLIB error: ${response.statusText}`);
        }

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error("Lyrics error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
