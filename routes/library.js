const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { spawn } = require('child_process');
const db = require('../db/db');
const { probeFile } = require('../lib/ffprobe');
const { verifyToken, requireAdmin } = require('./auth');

const AUDIO_EXT_REGEX = /\.(mp3|flac|wav|m4a|ogg|aac|opus|wma|aiff|aif|alac|ape|wv|tta|dts|ac3|eac3|mlp|ac4)$/i;

// --- Waveform peaks (for the real SoundCloud-style hover visualizer, not a fake CSS pulse) ---
const WAVEFORM_BUCKETS = 100;
const waveformCacheDir = path.join(__dirname, '..', 'db', 'waveform-cache');
const crypto = require('crypto');

function waveformCachePath(trackId) {
    const hash = crypto.createHash('sha1').update(trackId).digest('hex');
    return path.join(waveformCacheDir, `${hash}.json`);
}

// Decodes to mono/8kHz/32-bit-float PCM (tiny - fast even for a long, high-res source)
// and reduces it to a fixed number of peak-amplitude buckets spanning the whole track,
// normalized 0-1 against the loudest bucket so quiet tracks still show a full-range shape.
function computeWaveformPeaks(filePath, bucketCount = WAVEFORM_BUCKETS) {
    return new Promise((resolve, reject) => {
        const args = ['-i', filePath, '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 'f32le', 'pipe:1'];
        const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });
        const chunks = [];

        child.stdout.on('data', (chunk) => chunks.push(chunk));
        child.on('error', reject);
        child.on('close', (code) => {
            const buf = Buffer.concat(chunks);
            const sampleCount = Math.floor(buf.length / 4);
            if (sampleCount === 0) {
                return code === 0 ? resolve(new Array(bucketCount).fill(0)) : reject(new Error(`ffmpeg exited with code ${code}`));
            }

            const samplesPerBucket = Math.max(1, Math.floor(sampleCount / bucketCount));
            const peaks = new Array(bucketCount).fill(0);
            for (let b = 0; b < bucketCount; b++) {
                const start = b * samplesPerBucket;
                const end = Math.min(sampleCount, start + samplesPerBucket);
                let peak = 0;
                for (let i = start; i < end; i++) {
                    const v = Math.abs(buf.readFloatLE(i * 4));
                    if (v > peak) peak = v;
                }
                peaks[b] = peak;
            }

            const max = Math.max(...peaks, 0.0001);
            resolve(peaks.map((p) => Math.min(1, p / max)));
        });
    });
}

async function getWaveformPeaks(trackId, filePath) {
    const cachePath = waveformCachePath(trackId);
    if (fs.existsSync(cachePath)) {
        try {
            return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        } catch (_e) {
            // fall through and recompute if the cache file is somehow corrupt
        }
    }

    const peaks = await computeWaveformPeaks(filePath);
    try {
        fs.mkdirSync(waveformCacheDir, { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(peaks));
    } catch (err) {
        console.error('Failed to write waveform cache:', err.message);
    }
    return peaks;
}

function getSetting(key) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
}

let cachedLibrary = null;
let isScanning = false;

const upsertTrackStmt = db.prepare(`
    INSERT INTO tracks (
        id, source, path, title, artist, album, album_artist, genre, year, track_no, duration,
        container, codec, sample_rate, bit_depth, channels, channel_layout, bitrate,
        is_lossless, is_atmos, atmos_confidence, media_type, scan_error, file_mtime, updated_at
    ) VALUES (
        @id, @source, @path, @title, @artist, @album, @album_artist, @genre, @year, @track_no, @duration,
        @container, @codec, @sample_rate, @bit_depth, @channels, @channel_layout, @bitrate,
        @is_lossless, @is_atmos, @atmos_confidence, @media_type, @scan_error, @file_mtime, CURRENT_TIMESTAMP
    )
    ON CONFLICT(id) DO UPDATE SET
        source=excluded.source, path=excluded.path, title=excluded.title, artist=excluded.artist,
        album=excluded.album, album_artist=excluded.album_artist, genre=excluded.genre, year=excluded.year,
        track_no=excluded.track_no, duration=excluded.duration, container=excluded.container, codec=excluded.codec,
        sample_rate=excluded.sample_rate, bit_depth=excluded.bit_depth, channels=excluded.channels,
        channel_layout=excluded.channel_layout, bitrate=excluded.bitrate, is_lossless=excluded.is_lossless,
        is_atmos=excluded.is_atmos, atmos_confidence=excluded.atmos_confidence, media_type=excluded.media_type,
        scan_error=excluded.scan_error, file_mtime=excluded.file_mtime, updated_at=CURRENT_TIMESTAMP
`);

const getTrackByIdStmt = db.prepare('SELECT * FROM tracks WHERE id = ?');
const deleteStaleLocalTracksStmt = db.prepare(
    "DELETE FROM tracks WHERE source = 'local' AND id NOT IN (SELECT value FROM json_each(?))"
);

function persistTracks(tracks) {
    const ids = tracks.map((t) => t.id);
    const writeAll = db.transaction((rows) => {
        for (const row of rows) upsertTrackStmt.run(row);
        deleteStaleLocalTracksStmt.run(JSON.stringify(ids));
    });
    writeAll(tracks);
}

function trackRowToLibraryTrack(row) {
    return {
        id: row.id,
        type: 'local',
        path: row.path,
        title: row.title,
        artist: row.artist,
        album: row.album,
        genre: row.genre,
        duration: row.duration || 0,
        year: row.year,
        track_no: row.track_no,
        bitrate: row.bitrate || 0,
        container: row.container,
        codec: row.codec,
        sample_rate: row.sample_rate,
        bit_depth: row.bit_depth,
        channels: row.channels,
        channel_layout: row.channel_layout,
        is_lossless: !!row.is_lossless,
        is_atmos: !!row.is_atmos,
        atmos_confidence: row.atmos_confidence
    };
}

function buildLibraryFromRows(rows) {
    const library = { artists: {}, albums: {}, tracks: [] };

    rows.forEach((row) => {
        const track = trackRowToLibraryTrack(row);
        library.tracks.push(track);

        const artistName = track.artist || 'Unknown Artist';
        const albumName = track.album || 'Unknown Album';

        if (!library.artists[artistName]) {
            library.artists[artistName] = { name: artistName, albums: new Set() };
        }
        library.artists[artistName].albums.add(albumName);

        if (!library.albums[albumName]) {
            library.albums[albumName] = { name: albumName, artist: artistName, tracks: [] };
        }
        library.albums[albumName].tracks.push(track.id);
    });

    Object.keys(library.artists).forEach((artist) => {
        library.artists[artist].albums = Array.from(library.artists[artist].albums);
    });

    return library;
}

function loadLibraryFromDb() {
    try {
        const rows = db.prepare("SELECT * FROM tracks WHERE source = 'local'").all();
        if (rows.length > 0) {
            cachedLibrary = buildLibraryFromRows(rows);
            console.log(`📚 Rehydrated ${rows.length} tracks from database.`);
        }
    } catch (err) {
        console.error('Failed to rehydrate library from database:', err.message);
    }
}

// Rehydrate on module load so a server restart doesn't lose the scanned library.
loadLibraryFromDb();

async function walkDir(dir) {
    let results = [];
    const list = await fs.promises.readdir(dir);

    for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = await fs.promises.stat(filePath);

        if (stat && stat.isDirectory()) {
            results = results.concat(await walkDir(filePath));
        } else if (stat && stat.isFile()) {
            results.push(filePath);
        }
    }

    return results;
}

async function buildTrackRecord(file, mm, existingRow, hasAudioExtension) {
    const stat = await fs.promises.stat(file);
    const mtime = Math.floor(stat.mtimeMs);
    const trackId = `local_${Buffer.from(file).toString('base64')}`;

    // Incremental scan: skip re-probing files that haven't changed since last scan.
    if (existingRow && existingRow.file_mtime === mtime) {
        return { ...existingRow, id: trackId, path: file, file_mtime: mtime, reused: true };
    }

    let metadata = null;
    let metadataError = null;
    try {
        metadata = await mm.parseFile(file, { duration: true, skipCovers: true });
    } catch (err) {
        metadataError = err.message;
    }

    // A file with no recognized audio extension and unparseable tags isn't confidently
    // audio (could be cover art, a text file, etc.) - bail out before spawning ffprobe on it.
    if (!metadata && !hasAudioExtension) {
        throw new Error(metadataError || 'Not recognized as audio');
    }

    let probe = null;
    let probeError = null;
    try {
        probe = await probeFile(file);
    } catch (err) {
        probeError = err.message;
    }

    const artistName = metadata?.common?.artist || metadata?.common?.albumartist || 'Unknown Artist';
    const albumArtistName = metadata?.common?.albumartist || artistName;
    const albumName = metadata?.common?.album || 'Unknown Album';
    const title = metadata?.common?.title || path.basename(file, path.extname(file));

    return {
        id: trackId,
        source: 'local',
        path: file,
        title,
        artist: artistName,
        album_artist: albumArtistName,
        album: albumName,
        genre: metadata?.common?.genre ? metadata.common.genre[0] : 'Unknown',
        duration: metadata?.format?.duration || 0,
        year: metadata?.common?.year || null,
        track_no: metadata?.common?.track?.no || null,
        container: probe?.container || null,
        codec: probe?.codec || null,
        sample_rate: probe?.sample_rate || null,
        bit_depth: probe?.bit_depth || null,
        channels: probe?.channels || null,
        channel_layout: probe?.channel_layout || null,
        bitrate: probe?.bitrate || metadata?.format?.bitrate || 0,
        is_lossless: probe?.is_lossless || 0,
        is_atmos: probe?.is_atmos || 0,
        atmos_confidence: probe?.atmos_confidence || null,
        media_type: 'audio',
        scan_error: metadataError || probeError || null,
        file_mtime: mtime
    };
}

async function performScan(localPath) {
    const mm = await import('music-metadata');
    const files = await walkDir(localPath);
    const audioExtRegex = AUDIO_EXT_REGEX;
    const excludedFallbackExtRegex = /\.(jpg|jpeg|png|gif|webp|txt|nfo|pdf|doc|docx|ini|json|xml|log|lrc|srt|ass|ssa|cue|m3u|m3u8)$/i;

    const existingRows = db.prepare("SELECT * FROM tracks WHERE source = 'local'").all();
    const existingById = new Map(existingRows.map((r) => [r.id, r]));

    const tracks = [];
    let metadataFailures = 0;
    let nonAudioSkipped = 0;
    let fallbackTracks = 0;
    let reusedFromCache = 0;
    const fallbackCandidates = [];

    for (const file of files) {
        const hasAudioExtension = audioExtRegex.test(file);
        const trackId = `local_${Buffer.from(file).toString('base64')}`;

        try {
            const record = await buildTrackRecord(file, mm, existingById.get(trackId), hasAudioExtension);
            if (record.reused) reusedFromCache += 1;
            if (record.scan_error && hasAudioExtension) metadataFailures += 1;
            tracks.push(record);
        } catch (err) {
            if (hasAudioExtension) {
                metadataFailures += 1;
                console.error(`Failed to process ${file}:`, err.message);
            } else {
                nonAudioSkipped += 1;
                fallbackCandidates.push(file);
            }
        }
    }

    if (tracks.length === 0 && fallbackCandidates.length > 0) {
        for (const file of fallbackCandidates) {
            if (excludedFallbackExtRegex.test(file)) continue;

            const title = path.basename(file, path.extname(file));
            const trackId = `local_${Buffer.from(file).toString('base64')}`;
            const stat = await fs.promises.stat(file).catch(() => null);

            tracks.push({
                id: trackId,
                source: 'local',
                path: file,
                title,
                artist: 'Unknown Artist',
                album_artist: 'Unknown Artist',
                album: 'Unknown Album',
                genre: 'Unknown',
                duration: 0,
                year: null,
                track_no: null,
                container: null,
                codec: null,
                sample_rate: null,
                bit_depth: null,
                channels: null,
                channel_layout: null,
                bitrate: 0,
                is_lossless: 0,
                is_atmos: 0,
                atmos_confidence: null,
                media_type: 'audio',
                scan_error: 'fallback: could not detect format',
                file_mtime: stat ? Math.floor(stat.mtimeMs) : null
            });
            fallbackTracks += 1;
        }
    }

    // Guard against wiping the persisted library if the mount is temporarily unavailable
    // (walkDir returning zero files is treated as a scan failure upstream, not "folder is empty").
    if (files.length > 0) {
        persistTracks(tracks);
    }
    const library = buildLibraryFromRows(tracks);

    return {
        ...library,
        _scanDebug: {
            filesFound: files.length,
            metadataFailures,
            nonAudioSkipped,
            fallbackTracks,
            reusedFromCache
        }
    };
}

router.get('/status', (req, res) => {
    res.json({ isScanning });
});

router.get('/stats', verifyToken, requireAdmin, (req, res) => {
    try {
        const total = db.prepare("SELECT COUNT(*) as c FROM tracks WHERE source = 'local'").get().c;
        const byCodec = db.prepare(
            "SELECT codec, COUNT(*) as count FROM tracks WHERE source = 'local' GROUP BY codec ORDER BY count DESC"
        ).all();
        const lossless = db.prepare("SELECT COUNT(*) as c FROM tracks WHERE source = 'local' AND is_lossless = 1").get().c;
        const atmos = db.prepare("SELECT COUNT(*) as c FROM tracks WHERE source = 'local' AND is_atmos = 1").get().c;
        const multichannel = db.prepare("SELECT COUNT(*) as c FROM tracks WHERE source = 'local' AND channels > 2").get().c;
        const errors = db.prepare(
            "SELECT id, path, title, scan_error FROM tracks WHERE source = 'local' AND scan_error IS NOT NULL LIMIT 200"
        ).all();

        res.json({ total, lossless, lossy: total - lossless, atmos, multichannel, byCodec, errors });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/scan', verifyToken, requireAdmin, async (req, res) => {
    const localPath = getSetting('source_local');

    if (!localPath) {
        return res.status(400).json({ error: "Veuillez d'abord enregistrer un chemin local." });
    }

    if (!fs.existsSync(localPath)) {
        return res.status(400).json({ error: `Le dossier est introuvable dans le conteneur : ${localPath}. Vérifiez vos volumes Docker.` });
    }

    if (isScanning) {
        return res.status(400).json({ message: 'Already scanning' });
    }

    isScanning = true;
    try {
        const library = await performScan(localPath);
        if ((library._scanDebug?.filesFound || 0) === 0) {
            return res.status(400).json({
                error: `Aucun fichier détecté dans ${localPath} depuis le process Node. Vérifiez le montage Docker du HDD vers le conteneur.`
            });
        }
        cachedLibrary = library;
        console.log(`✅ Scan complete. Found ${library.tracks.length} tracks. Files: ${library._scanDebug?.filesFound || 0}, metadata failures: ${library._scanDebug?.metadataFailures || 0}, non-audio skipped: ${library._scanDebug?.nonAudioSkipped || 0}, fallback tracks: ${library._scanDebug?.fallbackTracks || 0}, reused from cache: ${library._scanDebug?.reusedFromCache || 0}`);
        return res.json({
            message: 'Scan terminé',
            tracks: library.tracks.length,
            artists: Object.keys(library.artists).length,
            albums: Object.keys(library.albums).length,
            filesFound: library._scanDebug?.filesFound || 0,
            metadataFailures: library._scanDebug?.metadataFailures || 0,
            nonAudioSkipped: library._scanDebug?.nonAudioSkipped || 0,
            fallbackTracks: library._scanDebug?.fallbackTracks || 0,
            reusedFromCache: library._scanDebug?.reusedFromCache || 0
        });
    } catch (err) {
        console.error('Scan error:', err);
        return res.status(500).json({ error: `Scan failed: ${err.message}` });
    } finally {
        isScanning = false;
    }
});

// --- Audio file upload (Admin > Sources > Importer) ---
// Busboy (which multer uses) decodes multipart field values as latin1 by default,
// but browsers send filenames as UTF-8 - without this, any accented/non-ASCII
// character in a filename comes out mangled (e.g. "édition" -> "Ã©dition").
function decodeOriginalName(name) {
    return Buffer.from(name, 'latin1').toString('utf8');
}

const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const localPath = getSetting('source_local');
        if (!localPath) return cb(new Error("Aucun dossier local configuré. Renseignez-le d'abord dans Admin > Sources."));
        if (!fs.existsSync(localPath)) return cb(new Error(`Le dossier local est introuvable : ${localPath}`));
        cb(null, localPath);
    },
    filename: (req, file, cb) => {
        const localPath = getSetting('source_local');
        // originalname may carry an attacker-controlled path; keep only the basename.
        const original = path.basename(decodeOriginalName(file.originalname));
        const ext = path.extname(original);
        const base = path.basename(original, ext);

        let candidate = original;
        let n = 1;
        while (fs.existsSync(path.join(localPath, candidate))) {
            candidate = `${base} (${n})${ext}`;
            n += 1;
        }
        cb(null, candidate);
    }
});

const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 50 }, // hi-res/Atmos files can be large
    fileFilter: (req, file, cb) => {
        const original = decodeOriginalName(file.originalname);
        if (!AUDIO_EXT_REGEX.test(original)) {
            return cb(new Error(`Format non supporté : ${original}`));
        }
        cb(null, true);
    }
});

router.post('/upload', verifyToken, requireAdmin, (req, res) => {
    upload.array('files', 50)(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'Aucun fichier reçu.' });
        }

        const uploaded = req.files.map((f) => f.filename);

        // The client uploads files individually (in small concurrency-limited batches) and
        // triggers one explicit scan itself once the whole batch is done, to avoid a
        // redundant full scan after every single file. autoScan defaults to true so this
        // endpoint stays convenient to call directly (e.g. via curl) without that field.
        const autoScan = req.body.autoScan !== 'false';
        if (!autoScan) {
            return res.json({ success: true, uploaded });
        }

        if (isScanning) {
            return res.json({ success: true, uploaded, scanSkipped: true, message: 'Fichiers importés. Un scan est déjà en cours, relancez-en un pour les inclure.' });
        }

        isScanning = true;
        try {
            const localPath = getSetting('source_local');
            const library = await performScan(localPath);
            cachedLibrary = library;
            res.json({
                success: true,
                uploaded,
                tracks: library.tracks.length,
                filesFound: library._scanDebug?.filesFound || 0
            });
        } catch (scanErr) {
            console.error('Post-upload scan error:', scanErr);
            res.json({ success: true, uploaded, scanError: scanErr.message });
        } finally {
            isScanning = false;
        }
    });
});

router.get('/', (req, res) => {
    if (!cachedLibrary) {
        return res.json({ artists: {}, albums: {}, tracks: [] });
    }

    res.json(cachedLibrary);
});

router.get('/cover/:id', async (req, res) => {
    const trackId = req.params.id;
    if (!trackId.startsWith('local_')) return res.status(404).send('Not local');

    try {
        const decodedPath = Buffer.from(trackId.replace('local_', ''), 'base64').toString('utf-8');
        if (!fs.existsSync(decodedPath)) return res.status(404).send('File missing');

        const trackDir = path.dirname(decodedPath);
        const coverNames = ['cover.jpg', 'cover.png', 'cover.jpeg', 'folder.jpg', 'folder.png', 'albumart.jpg', 'albumart.png', 'front.jpg', 'front.png'];

        for (const coverName of coverNames) {
            const coverPath = path.join(trackDir, coverName);
            if (fs.existsSync(coverPath)) {
                res.setHeader('Content-Type', coverName.endsWith('.png') ? 'image/png' : 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.sendFile(coverPath);
            }
        }

        const { parseFile } = await import('music-metadata');
        const metadata = await parseFile(decodedPath);
        const picture = metadata.common.picture ? metadata.common.picture[0] : null;

        if (picture) {
            res.header('Content-Type', picture.format);
            res.header('Cache-Control', 'public, max-age=86400');
            // picture.data is a Uint8Array, not a real Node Buffer - res.send() only
            // sends raw bytes for an actual Buffer, otherwise it silently falls back to
            // JSON-serializing it (as {"0":255,"1":216,...}), corrupting every cover.
            return res.send(Buffer.from(picture.data));
        }

        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.sendFile(path.resolve(__dirname, '../public/assets/default-cover.png'));
    } catch (err) {
        console.error('Cover extraction error:', err);
        return res.status(500).send('Error extracting cover');
    }
});

router.get('/waveform/:id', async (req, res) => {
    const trackId = req.params.id;
    if (!trackId.startsWith('local_')) return res.status(404).json({ error: 'Not local' });

    try {
        const track = getTrackByIdStmt.get(trackId);
        const filePath = track?.path || Buffer.from(trackId.replace('local_', ''), 'base64').toString('utf-8');
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });

        const peaks = await getWaveformPeaks(trackId, filePath);
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.json({ peaks });
    } catch (err) {
        console.error('Waveform computation error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
module.exports.performScan = performScan;
module.exports.getTrackById = (id) => getTrackByIdStmt.get(id);
