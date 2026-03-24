const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db/db');

// Read settings helper
function getSetting(key) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? row.value : null;
}

// Global cached library (in a real app we'd use SQLite for this too, but for speed in this prototype we can cache in memory)
let cachedLibrary = null;
let isScanning = false;

// Scan directory recursively
async function walkDir(dir) {
    let results = [];
    const list = await fs.promises.readdir(dir);
    for (let file of list) {
        let filePath = path.join(dir, file);
        const stat = await fs.promises.stat(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(await walkDir(filePath));
        } else {
            // Filter audio files
            if (filePath.match(/\.(mp3|flac|wav|m4a|ogg|aac|opus)$/i)) {
                results.push(filePath);
            }
        }
    }
    return results;
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

    if (isScanning) return res.status(400).json({ message: "Already scanning" });
    isScanning = true;
    res.json({ message: "Scan started" }); // Respond immediately

    try {
        const mm = await import('music-metadata'); // dynamic import for ESM module
        const files = await walkDir(localPath);
        
        let library = {
            artists: {},
            albums: {},
            tracks: []
        };

        for (const file of files) {
            try {
                const metadata = await mm.parseFile(file, { duration: true, skipCovers: true }); // Skip covers for now to save memory, fetch them specifically later
                
                const artistName = metadata.common.artist || metadata.common.albumartist || "Unknown Artist";
                const albumName = metadata.common.album || "Unknown Album";
                const title = metadata.common.title || path.basename(file, path.extname(file));

                const trackId = `local_${Buffer.from(file).toString('base64')}`;

                const track = {
                    id: trackId,
                    type: 'local',
                    path: file,
                    title,
                    artist: artistName,
                    album: albumName,
                    genre: metadata.common.genre ? metadata.common.genre[0] : "Unknown",
                    duration: metadata.format.duration || 0,
                    year: metadata.common.year,
                    track_no: metadata.common.track.no || null,
                    bitrate: metadata.format.bitrate || 0
                };

                library.tracks.push(track);

                // Build Artist Tree
                if (!library.artists[artistName]) {
                    library.artists[artistName] = { name: artistName, albums: new Set() };
                }
                library.artists[artistName].albums.add(albumName);

                // Build Album Tree
                if (!library.albums[albumName]) {
                    library.albums[albumName] = { name: albumName, artist: artistName, tracks: [] };
                }
                library.albums[albumName].tracks.push(trackId);

            } catch (err) {
                console.error(`Failed to parse metadata for ${file}: `, err.message);
            }
        }

        // Convert Sets to Arrays for JSON serialization
        Object.keys(library.artists).forEach(a => {
            library.artists[a].albums = Array.from(library.artists[a].albums);
        });

        cachedLibrary = library;
        isScanning = false;
        console.log(`✅ Scan complete. Found ${library.tracks.length} tracks.`);

    } catch (err) {
        console.error("Scan error:", err);
        isScanning = false;
    }
});

router.get('/', (req, res) => {
    if (!cachedLibrary) {
        return res.json({ artists: {}, albums: {}, tracks: [] }); // Return empty if not scanned
    }
    res.json(cachedLibrary);
});

// Route to fetch album art specifically (extracted dynamically)
router.get('/cover/:id', async (req, res) => {
    const trackId = req.params.id;
    if (!trackId.startsWith('local_')) return res.status(404).send('Not local');
    
    try {
        const decodedPath = Buffer.from(trackId.replace('local_', ''), 'base64').toString('utf-8');
        if (!fs.existsSync(decodedPath)) return res.status(404).send('File missing');

        const trackDir = path.dirname(decodedPath);
        
        // List of common cover file names to check
        const coverNames = ['cover.jpg', 'cover.png', 'cover.jpeg', 'folder.jpg', 'folder.png', 'albumart.jpg', 'albumart.png', 'front.jpg', 'front.png'];
        
        // Check for cover files in the album directory
        for (const coverName of coverNames) {
            const coverPath = path.join(trackDir, coverName);
            if (fs.existsSync(coverPath)) {
                // Serve the cover file
                res.setHeader('Content-Type', coverName.endsWith('.png') ? 'image/png' : 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.sendFile(coverPath);
            }
        }

        // If no cover file found, try extracting from metadata
        const { parseFile } = await import('music-metadata');
        const metadata = await parseFile(decodedPath);
        
        const picture = metadata.common.picture ? metadata.common.picture[0] : null;
        if (picture) {
            res.header('Content-Type', picture.format);
            res.header('Cache-Control', 'public, max-age=86400');
            res.send(picture.data);
        } else {
            // Fallback to default cover
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.sendFile(path.resolve(__dirname, '../public/assets/default-cover.png'));
        }
    } catch (err) {
        console.error("Cover extraction error:", err);
        res.status(500).send('Error extracting cover');
    }
});

module.exports = router;
