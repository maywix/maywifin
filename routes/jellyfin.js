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
        let response = await fetch(fetchUrl, {
            headers: {
                'X-Emby-Token': auth.token
            }
        });

        // Retry once with forced refresh if token looks invalid
        if (response.status === 401) {
            try {
                auth = await getJellyfinAuth(true);
                const retryBaseUrl = auth.url.endsWith('/') ? auth.url.slice(0, -1) : auth.url;
                response = await fetch(`${retryBaseUrl}${path}`, {
                    headers: {
                        'X-Emby-Token': auth.token
                    }
                });
            } catch (_e) {
                // Let the normal error flow handle this
            }
        }

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

// Explicit connect test / refresh token
router.post('/connect', async (req, res) => {
    try {
        const auth = await getJellyfinAuth(true);
        const baseUrl = auth.url.endsWith('/') ? auth.url.slice(0, -1) : auth.url;

        const me = await fetch(`${baseUrl}/Users/${auth.userId}`, {
            headers: {
                'X-Emby-Token': auth.token
            }
        });

        if (!me.ok) {
            throw new Error('Jellyfin connected but user validation failed');
        }

        const meData = await me.json().catch(() => ({}));
        return res.json({ success: true, message: 'Connexion Jellyfin réussie', user: meData?.Name || null });
    } catch (err) {
        return res.status(400).json({ error: err.message || 'Connexion Jellyfin échouée' });
    }
});

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
