const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db/db');

function getSetting(key) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
}

let cachedLibrary = null;
let isScanning = false;

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

async function performScan(localPath) {
    const mm = await import('music-metadata');
    const files = await walkDir(localPath);
    const audioExtRegex = /\.(mp3|flac|wav|m4a|ogg|aac|opus|wma|aiff|alac|ape)$/i;
    const excludedFallbackExtRegex = /\.(jpg|jpeg|png|gif|webp|txt|nfo|pdf|doc|docx|ini|json|xml|log|lrc|srt|ass|ssa|cue|m3u|m3u8)$/i;

    const library = {
        artists: {},
        albums: {},
        tracks: []
    };

    let metadataFailures = 0;
    let nonAudioSkipped = 0;
    let fallbackTracks = 0;
    const fallbackCandidates = [];

    for (const file of files) {
        const hasAudioExtension = audioExtRegex.test(file);
        let metadata = null;
        try {
            metadata = await mm.parseFile(file, { duration: true, skipCovers: true });
        } catch (err) {
            if (!hasAudioExtension) {
                nonAudioSkipped += 1;
                fallbackCandidates.push(file);
                continue;
            }
            metadataFailures += 1;
            console.error(`Failed to parse metadata for ${file}:`, err.message);
        }

        const artistName = metadata?.common?.artist || metadata?.common?.albumartist || 'Unknown Artist';
        const albumName = metadata?.common?.album || 'Unknown Album';
        const title = metadata?.common?.title || path.basename(file, path.extname(file));
        const trackId = `local_${Buffer.from(file).toString('base64')}`;

        const track = {
            id: trackId,
            type: 'local',
            path: file,
            title,
            artist: artistName,
            album: albumName,
            genre: metadata?.common?.genre ? metadata.common.genre[0] : 'Unknown',
            duration: metadata?.format?.duration || 0,
            year: metadata?.common?.year,
            track_no: metadata?.common?.track?.no || null,
            bitrate: metadata?.format?.bitrate || 0
        };

        library.tracks.push(track);

        if (!library.artists[artistName]) {
            library.artists[artistName] = { name: artistName, albums: new Set() };
        }
        library.artists[artistName].albums.add(albumName);

        if (!library.albums[albumName]) {
            library.albums[albumName] = { name: albumName, artist: artistName, tracks: [] };
        }
        library.albums[albumName].tracks.push(trackId);
    }

    Object.keys(library.artists).forEach((artist) => {
        library.artists[artist].albums = Array.from(library.artists[artist].albums);
    });

    if (library.tracks.length === 0 && fallbackCandidates.length > 0) {
        for (const file of fallbackCandidates) {
            if (excludedFallbackExtRegex.test(file)) continue;

            const title = path.basename(file, path.extname(file));
            const trackId = `local_${Buffer.from(file).toString('base64')}`;
            const artistName = 'Unknown Artist';
            const albumName = 'Unknown Album';

            const track = {
                id: trackId,
                type: 'local',
                path: file,
                title,
                artist: artistName,
                album: albumName,
                genre: 'Unknown',
                duration: 0,
                year: null,
                track_no: null,
                bitrate: 0
            };

            library.tracks.push(track);

            if (!library.artists[artistName]) {
                library.artists[artistName] = { name: artistName, albums: new Set() };
            }
            library.artists[artistName].albums.add(albumName);

            if (!library.albums[albumName]) {
                library.albums[albumName] = { name: albumName, artist: artistName, tracks: [] };
            }
            library.albums[albumName].tracks.push(trackId);
            fallbackTracks += 1;
        }

        Object.keys(library.artists).forEach((artist) => {
            if (library.artists[artist].albums instanceof Set) {
                library.artists[artist].albums = Array.from(library.artists[artist].albums);
            }
        });
    }

    return {
        ...library,
        _scanDebug: {
            filesFound: files.length,
            metadataFailures,
            nonAudioSkipped,
            fallbackTracks
        }
    };
}

router.get('/status', (req, res) => {
    res.json({ isScanning });
});

router.post('/scan', async (req, res) => {
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
        console.log(`✅ Scan complete. Found ${library.tracks.length} tracks. Files: ${library._scanDebug?.filesFound || 0}, metadata failures: ${library._scanDebug?.metadataFailures || 0}, non-audio skipped: ${library._scanDebug?.nonAudioSkipped || 0}, fallback tracks: ${library._scanDebug?.fallbackTracks || 0}`);
        return res.json({
            message: 'Scan terminé',
            tracks: library.tracks.length,
            artists: Object.keys(library.artists).length,
            albums: Object.keys(library.albums).length,
            filesFound: library._scanDebug?.filesFound || 0,
            metadataFailures: library._scanDebug?.metadataFailures || 0,
            nonAudioSkipped: library._scanDebug?.nonAudioSkipped || 0,
            fallbackTracks: library._scanDebug?.fallbackTracks || 0
        });
    } catch (err) {
        console.error('Scan error:', err);
        return res.status(500).json({ error: `Scan failed: ${err.message}` });
    } finally {
        isScanning = false;
    }
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
            return res.send(picture.data);
        }

        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.sendFile(path.resolve(__dirname, '../public/assets/default-cover.png'));
    } catch (err) {
        console.error('Cover extraction error:', err);
        return res.status(500).send('Error extracting cover');
    }
});

module.exports = router;
module.exports.performScan = performScan;
