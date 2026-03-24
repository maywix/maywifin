const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Read settings helper
function getJellyfinConfig() {
    const url = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_url'").get()?.value;
    const apiKey = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_apikey'").get()?.value;
    const userId = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_userid'").get()?.value;
    return { url, apiKey, userId };
}

// Unified proxy helper
async function proxyJellyfinFallback(endpoint, req, res) {
    const { url, apiKey, userId } = getJellyfinConfig();
    if (!url || !apiKey || !userId) return res.status(400).json({ error: "Jellyfin not configured" });

    // Ensure URL doesn't end with slash, endpoint should start with slash
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    try {
        const fetchUrl = `${baseUrl}${path}`;
        const response = await fetch(fetchUrl, {
            headers: {
                'X-Emby-Token': apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`Jellyfin API error: ${response.statusText}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Jellyfin proxy error:", err);
        res.status(500).json({ error: err.message });
    }
}

// Proxies
router.get('/artists', (req, res) => {
    const { userId } = getJellyfinConfig();
    proxyJellyfinFallback(`/Artists?UserId=${userId}&SortBy=SortName`, req, res);
});

router.get('/albums', (req, res) => {
    const { userId } = getJellyfinConfig();
    const artistId = req.query.artistId;
    let endpoint = `/Users/${userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=ProductionYear,PremiereDate&SortOrder=Descending`;
    if (artistId) endpoint += `&ArtistIds=${artistId}`;
    
    proxyJellyfinFallback(endpoint, req, res);
});

router.get('/tracks', (req, res) => {
    const { userId } = getJellyfinConfig();
    const albumId = req.query.albumId;
    let endpoint = `/Users/${userId}/Items?IncludeItemTypes=Audio&Recursive=true`;
    if (albumId) endpoint += `&ParentId=${albumId}`;
    
    proxyJellyfinFallback(endpoint, req, res);
});

// Image cover proxy (returns raw image)
router.get('/cover/:id', async (req, res) => {
    const { url } = getJellyfinConfig();
    if (!url) return res.status(404).send('Jellyfin not configured');

    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    try {
        const fetchUrl = `${baseUrl}/Items/${req.params.id}/Images/Primary`;
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error("Image not found");

        const buffer = await response.arrayBuffer();
        res.set('Content-Type', response.headers.get('content-type'));
        res.send(Buffer.from(buffer));
    } catch(err) {
        res.status(404).send('Error');
    }
});

module.exports = router;
