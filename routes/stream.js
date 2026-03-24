const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db/db');

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

    if (apiKey && userId) {
        return { url, token: apiKey, userId };
    }

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

router.get('/:id', async (req, res) => {
    const trackId = req.params.id;
    const bitrate = req.query.bitrate; // optional config

    // 1. LOCAL FILE
    if (trackId.startsWith('local_')) {
        try {
            const filePath = Buffer.from(trackId.replace('local_', ''), 'base64').toString('utf-8');
            if (!fs.existsSync(filePath)) return res.status(404).send('Local file not found');

            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

                const chunksize = (end - start) + 1;
                const file = fs.createReadStream(filePath, { start, end });
                
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'audio/mpeg', // Generic mime type, browser usually figures it out
                };

                res.writeHead(206, head);
                file.pipe(res);
            } else {
                const head = {
                    'Content-Length': fileSize,
                    'Content-Type': 'audio/mpeg',
                };
                res.writeHead(200, head);
                fs.createReadStream(filePath).pipe(res);
            }
        } catch (err) {
            res.status(500).send("Streaming error");
        }
        return;
    }

    // 2. JELLYFIN STREAM
    let auth;
    try {
        auth = await getJellyfinAuth();
    } catch (err) {
        return res.status(400).send("Jellyfin not configured");
    }

    const baseUrl = auth.url.endsWith('/') ? auth.url.slice(0, -1) : auth.url;
    
    // Construct stream URL
    let streamUrl = `${baseUrl}/Audio/${trackId}/universal?UserId=${auth.userId}&DeviceId=maywifin_web&api_key=${auth.token}&Container=mp3,aac,flac,webma,webm,wav,ogg`;
    
    // If quality is configured (e.g., 320000)
    if (bitrate && bitrate !== 'lossless') {
        streamUrl += `&MaxStreamingBitrate=${bitrate}`;
    }

    // Simple redirect - let the browser handle range requests direct to Jellyfin if possible, 
    // OR we can pipe it. Redirect is simpler and more robust for native HTML5 audio.
    res.redirect(streamUrl);
});

module.exports = router;
