const express = require('express');
const router = express.Router();
const db = require('../db/db');

// Read settings helper
function getJellyfinConfig() {
    const url = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_url'").get()?.value;
    const apiKey = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_apikey'").get()?.value;
    const userId = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_userid'").get()?.value;
    const username = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_username'").get()?.value;
    const password = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_password'").get()?.value;
    return { url, apiKey, userId, username, password };
}

async function getJellyfinAuth() {
    const { url, apiKey, userId, username, password } = getJellyfinConfig();
    if (!url) throw new Error('Jellyfin URL missing');

    // Legacy/fallback mode
    if (apiKey && userId) {
        return { url, token: apiKey, userId };
    }

    // Username/password mode
    if (!username || !password) {
        throw new Error('Jellyfin credentials missing');
    }

    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const authRes = await fetch(`${baseUrl}/Users/AuthenticateByName`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Emby-Authorization': 'MediaBrowser Client="MayWiFin", Device="MayWiFin", DeviceId="maywifin_web", Version="1.0.0"'
        },
        body: JSON.stringify({ Username: username, Pw: password })
    });

    if (!authRes.ok) {
        throw new Error('Jellyfin login failed');
    }

    const authData = await authRes.json();
    return { url, token: authData.AccessToken, userId: authData.User?.Id };
}

// Unified proxy helper
async function proxyJellyfinFallback(endpoint, req, res) {
    let auth;
    try {
        auth = await getJellyfinAuth();
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    // Ensure URL doesn't end with slash, endpoint should start with slash
    const baseUrl = auth.url.endsWith('/') ? auth.url.slice(0, -1) : auth.url;
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    try {
        const fetchUrl = `${baseUrl}${path}`;
        const response = await fetch(fetchUrl, {
            headers: {
                'X-Emby-Token': auth.token
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
    getJellyfinAuth()
        .then(({ userId }) => proxyJellyfinFallback(`/Artists?UserId=${userId}&SortBy=SortName`, req, res))
        .catch((err) => res.status(400).json({ error: err.message }));
});

router.get('/albums', (req, res) => {
    getJellyfinAuth()
        .then(({ userId }) => {
            const artistId = req.query.artistId;
            let endpoint = `/Users/${userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=ProductionYear,PremiereDate&SortOrder=Descending`;
            if (artistId) endpoint += `&ArtistIds=${artistId}`;
            proxyJellyfinFallback(endpoint, req, res);
        })
        .catch((err) => res.status(400).json({ error: err.message }));
});

router.get('/tracks', (req, res) => {
    getJellyfinAuth()
        .then(({ userId }) => {
            const albumId = req.query.albumId;
            let endpoint = `/Users/${userId}/Items?IncludeItemTypes=Audio&Recursive=true`;
            if (albumId) endpoint += `&ParentId=${albumId}`;
            proxyJellyfinFallback(endpoint, req, res);
        })
        .catch((err) => res.status(400).json({ error: err.message }));
});

// Image cover proxy (returns raw image)
router.get('/cover/:id', async (req, res) => {
    let auth;
    try {
        auth = await getJellyfinAuth();
    } catch (err) {
        return res.status(404).send('Jellyfin not configured');
    }

    const baseUrl = auth.url.endsWith('/') ? auth.url.slice(0, -1) : auth.url;
    try {
        const fetchUrl = `${baseUrl}/Items/${req.params.id}/Images/Primary`;
        const response = await fetch(fetchUrl, {
            headers: {
                'X-Emby-Token': auth.token
            }
        });
        if (!response.ok) throw new Error("Image not found");

        const buffer = await response.arrayBuffer();
        res.set('Content-Type', response.headers.get('content-type'));
        res.send(Buffer.from(buffer));
    } catch(err) {
        res.status(404).send('Error');
    }
});

module.exports = router;
