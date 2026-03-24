const express = require('express');
const router = express.Router();
const { getJellyfinAuth } = require('./jellyfin-auth');

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

// Trigger Jellyfin library refresh scan
router.post('/scan', async (req, res) => {
    let auth;
    try {
        auth = await getJellyfinAuth();
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    const baseUrl = auth.url.endsWith('/') ? auth.url.slice(0, -1) : auth.url;

    try {
        const refreshRes = await fetch(`${baseUrl}/Library/Refresh`, {
            method: 'POST',
            headers: {
                'X-Emby-Token': auth.token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Recursive: true,
                ImageRefreshMode: 'Default',
                MetadataRefreshMode: 'Default',
                ReplaceAllImages: false,
                ReplaceAllMetadata: false
            })
        });

        if (!refreshRes.ok) {
            const detail = await refreshRes.text().catch(() => '');
            throw new Error(detail || `Jellyfin refresh failed (${refreshRes.status})`);
        }

        return res.json({ success: true, message: 'Scan Jellyfin déclenché' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
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
