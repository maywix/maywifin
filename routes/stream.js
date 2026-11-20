const express = require('express');
const router = express.Router();
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('../db/db');
const { getJellyfinAuth } = require('./jellyfin-auth');
const { getTrackById } = require('./library');
const { mimeForTrack } = require('../lib/mime-map');
const { resolveStreamPlan, resolveAvailableTiers } = require('../lib/quality-tiers');

function getSetting(key, fallback) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row?.value ?? fallback;
}

// Safari (desktop and iOS - iOS browsers are all WebKit under the hood regardless of
// name) decodes a wider set of codecs than Chromium/Firefox; excludes Chrome/Edge/Android
// which also carry "Safari" in their UA string for legacy compatibility reasons.
function isSafariRequest(req) {
    const ua = req.headers['user-agent'] || '';
    return /^(?!.*chrome|.*chromium|.*crios|.*edg|.*android).*safari/i.test(ua);
}

let activeTranscodes = 0;

function maxConcurrentTranscodes() {
    return parseInt(getSetting('transcode_max_concurrent', '4'), 10) || 4;
}

function streamLocalPassthrough(req, res, filePath, contentType) {
    if (!fs.existsSync(filePath)) return res.status(404).send('Local file not found');

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType
        });
        file.pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(filePath).pipe(res);
    }
}

function buildFfmpegArgs(filePath, plan, seekTime) {
    const args = [];
    if (seekTime && seekTime > 0) {
        args.push('-ss', String(seekTime));
    }
    args.push('-i', filePath);
    args.push('-map', '0:a:0', '-vn');
    if (plan.downmix) {
        args.push('-ac', '2');
    }

    if (plan.targetFormat === 'flac') {
        // Lossless re-encode purely for browser codec compatibility (e.g. ALAC/APE/WavPack
        // aren't natively decodable by Chrome/Firefox) - no bitrate cap, no quality loss.
        args.push('-c:a', 'flac', '-f', 'flac', 'pipe:1');
    } else {
        const kbps = Math.floor((plan.targetBitrate || 320000) / 1000);
        args.push('-c:a', 'libmp3lame', '-b:a', `${kbps}k`);
        args.push('-f', 'mp3', 'pipe:1');
    }
    return args;
}

function streamLocalTranscode(req, res, filePath, plan, seekTime) {
    if (!fs.existsSync(filePath)) return res.status(404).send('Local file not found');

    if (activeTranscodes >= maxConcurrentTranscodes()) {
        return res.status(503).json({ error: 'Trop de transcodages simultanés, réessayez dans un instant.' });
    }

    // Rapid re-seeking kills this ffmpeg child mid-stream (see req.on('close') below) while
    // it may still be writing - without these guards, the now-aborted/destroyed response
    // gets written to again from the child's own 'close'/'error' handlers, which can throw
    // an unhandled stream error and crash the *entire* Node process, not just this request.
    let settled = false;
    res.on('error', () => { settled = true; }); // client gone mid-write - not our problem
    req.on('error', () => { settled = true; });

    const args = buildFfmpegArgs(filePath, plan, seekTime);
    let child;
    let stderrTail = '';

    try {
        child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
        return res.status(500).json({ error: `Impossible de démarrer ffmpeg: ${err.message}` });
    }

    activeTranscodes += 1;
    const release = () => { activeTranscodes = Math.max(0, activeTranscodes - 1); };

    child.stdout.on('error', () => { settled = true; }); // e.g. EPIPE writing into a killed pipe

    child.stderr.on('data', (chunk) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    });

    child.on('error', (err) => {
        release();
        if (settled || res.destroyed || res.writableEnded) return;
        settled = true;
        if (!res.headersSent) {
            res.status(500).json({ error: `ffmpeg introuvable ou a échoué au démarrage: ${err.message}` });
        } else {
            res.end();
        }
    });

    child.on('close', (code) => {
        release();
        if (settled || res.destroyed || res.writableEnded) return;
        settled = true;
        if (!res.headersSent) {
            res.status(500).json({ error: `Le transcodage ffmpeg a échoué (code ${code}).`, detail: stderrTail.slice(-500) });
        } else {
            res.end();
        }
    });

    req.on('close', () => {
        settled = true;
        if (child && !child.killed) child.kill('SIGKILL');
    });

    res.writeHead(200, {
        'Content-Type': plan.targetFormat === 'flac' ? 'audio/flac' : 'audio/mpeg',
        'Accept-Ranges': 'none'
    });
    child.stdout.pipe(res);
}

router.get('/:id/tiers', (req, res) => {
    const trackId = req.params.id;
    const requestedTier = req.query.tier || 'lossless';

    if (trackId.startsWith('local_')) {
        const track = getTrackById(trackId);
        if (!track) return res.status(404).json({ error: 'Track not found' });
        const isSafari = isSafariRequest(req);
        return res.json({
            ...resolveAvailableTiers(track),
            requestedTierPlan: resolveStreamPlan(track, requestedTier, { isSafari })
        });
    }

    // Jellyfin tracks: format metadata isn't mirrored locally (Jellyfin is the source of
    // truth for its own library) - report a permissive default rather than guessing.
    // Jellyfin's own /universal endpoint always supports HTTP range requests directly,
    // so from the frontend's perspective this always behaves like a passthrough.
    res.json({
        tiers: {
            hires: { available: false, disabledReason: 'jellyfin-source' },
            lossless: { available: true, disabledReason: null },
            '320': { available: true, disabledReason: null },
            '128': { available: true, disabledReason: null }
        },
        sourceIsLossless: null,
        sourceBitrate: null,
        sourceCodec: null,
        sourceChannels: null,
        isAtmos: false,
        isMaxQuality: false,
        requestedTierPlan: { mode: 'passthrough', targetFormat: null, targetBitrate: null, downmix: false, reason: null }
    });
});

router.get('/:id', async (req, res) => {
    const trackId = req.params.id;
    const tier = req.query.tier || req.query.bitrate || 'lossless';
    const seekTime = req.query.seekTime ? parseFloat(req.query.seekTime) : 0;

    // 1. LOCAL FILE
    if (trackId.startsWith('local_')) {
        try {
            const track = getTrackById(trackId);
            const filePath = track?.path || Buffer.from(trackId.replace('local_', ''), 'base64').toString('utf-8');

            if (!fs.existsSync(filePath)) return res.status(404).send('Local file not found');

            const plan = resolveStreamPlan(track || {}, tier, { isSafari: isSafariRequest(req) });
            if (plan.reason) res.setHeader('X-Quality-Downgraded', plan.reason);

            if (plan.mode === 'passthrough') {
                return streamLocalPassthrough(req, res, filePath, mimeForTrack(track));
            }
            return streamLocalTranscode(req, res, filePath, plan, seekTime);
        } catch (err) {
            console.error('Streaming error:', err);
            if (!res.headersSent) res.status(500).send('Streaming error');
        }
        return;
    }

    // 2. JELLYFIN STREAM
    let auth;
    try {
        auth = await getJellyfinAuth();
    } catch (err) {
        return res.status(400).send('Jellyfin not configured');
    }

    const baseUrl = auth.url.endsWith('/') ? auth.url.slice(0, -1) : auth.url;

    // AudioCodec=mp3 is a *hint* Jellyfin only actually uses when it decides to transcode -
    // confirmed a FLAC source still passes through byte-identical with this set. Without it,
    // Jellyfin's own codec auto-selection silently fails (HTTP 200, zero bytes, no error) on
    // at least multichannel/Atmos E-AC-3-in-.m4a sources - this is what made those unplayable.
    let streamUrl = `${baseUrl}/Audio/${trackId}/universal?UserId=${auth.userId}&DeviceId=maywifin_web&api_key=${auth.token}&Container=mp3,aac,flac,webma,webm,wav,ogg&AudioCodec=mp3&MaxAudioChannels=2`;

    if (tier === '320') {
        streamUrl += '&MaxStreamingBitrate=320000';
    } else if (tier === '128') {
        streamUrl += '&MaxStreamingBitrate=128000';
    }
    // hires/lossless: no MaxStreamingBitrate cap, let Jellyfin serve its best available.

    res.redirect(streamUrl);
});

module.exports = router;
