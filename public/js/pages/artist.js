import { Api, AppState } from '../api.js';
import { Player } from '../player/player.js';

function getSourceFromHash() {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex === -1) return 'local';
    const params = new URLSearchParams(hash.substring(queryIndex + 1));
    return params.get('source') === 'jellyfin' ? 'jellyfin' : 'local';
}

function normalizeJellyfinTracks(raw) {
    const items = Array.isArray(raw) ? raw : (raw.Items || []);
    return items.map((item) => ({
        id: item.Id,
        type: 'jellyfin',
        title: item.Name || 'Unknown Title',
        artist: (item.Artists && item.Artists[0]) || item.AlbumArtist || 'Unknown Artist',
        album: item.Album || 'Unknown Album',
        track_no: item.IndexNumber || null,
        duration: item.RunTimeTicks ? item.RunTimeTicks / 10000000 : 0,
        albumId: item.AlbumId || item.Id
    }));
}

function buildLibraryFromTracks(tracks) {
    const artists = {};
    const albums = {};

    tracks.forEach((track) => {
        if (!artists[track.artist]) {
            artists[track.artist] = { name: track.artist, albums: new Set() };
        }
        artists[track.artist].albums.add(track.album);

        if (!albums[track.album]) {
            albums[track.album] = { name: track.album, artist: track.artist, tracks: [] };
        }
        albums[track.album].tracks.push(track.id);
    });

    Object.keys(artists).forEach((artist) => {
        artists[artist].albums = Array.from(artists[artist].albums);
    });

    return { artists, albums, tracks };
}

export async function renderArtist(container, params) {
    const artistName = decodeURIComponent(params.id);
    const source = getSourceFromHash();

    container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';

    try {
        if (source === 'jellyfin') {
            const jellyfinRaw = await Api.getJellyfinTracks();
            AppState.jellyfin = buildLibraryFromTracks(normalizeJellyfinTracks(jellyfinRaw));
        } else if (Object.keys(AppState.library.artists).length === 0) {
            AppState.library = await Api.getLocalLibrary();
        }
    } catch (e) {
        return (container.innerHTML = '<div class="error-msg">Erreur de chargement.</div>');
    }

    const currentLib = source === 'jellyfin' ? AppState.jellyfin : AppState.library;
    const { artists, albums, tracks } = currentLib;
    const artist = artists[artistName];

    if (!artist) {
        return (container.innerHTML = '<h2 class="page-title">Artiste introuvable</h2>');
    }

    const artistAlbums = [];
    const artistSingles = [];

    artist.albums.forEach((albumName) => {
        const al = albums[albumName];
        if (!al) return;
        if (al.tracks.length > 1) artistAlbums.push(al);
        else if (al.tracks.length === 1) artistSingles.push(al);
    });

    artistAlbums.sort((a, b) => a.name.localeCompare(b.name));
    artistSingles.sort((a, b) => a.name.localeCompare(b.name));

    let coverUrl = '/assets/default-cover.png';
    const coverTrackId = artistAlbums[0]?.tracks?.[0] || artistSingles[0]?.tracks?.[0];
    if (coverTrackId) {
        if (source === 'jellyfin') {
            const fullTrack = tracks.find((t) => t.id === coverTrackId);
            coverUrl = `/api/jellyfin/cover/${fullTrack?.albumId || coverTrackId}`;
        } else {
            coverUrl = `/api/library/cover/${coverTrackId}`;
        }
    }

    const sourceQuery = `?source=${source}`;

    let html = `
        <div style="display: flex; align-items: flex-end; gap: 32px; margin-bottom: 48px;">
            <img src="${coverUrl}" style="width: 200px; height: 200px; border-radius: 50%; object-fit: cover; box-shadow: 0 16px 32px rgba(0,0,0,0.5);">
            <div>
                <p class="text-secondary" style="font-weight: 600; text-transform: uppercase; letter-spacing: 2px;">Artiste</p>
                <h1 class="page-title" style="margin-bottom: 8px; font-size: 64px;">${artistName}</h1>
            </div>
        </div>

        ${artistAlbums.length > 0 ? `
            <h2 class="section-title">Albums</h2>
            <div class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 24px; margin-bottom: 48px;">
                ${artistAlbums.map(al => {
                    const fullTrack = tracks.find((t) => t.id === al.tracks[0]);
                    const cUrl = source === 'jellyfin'
                        ? `/api/jellyfin/cover/${fullTrack?.albumId || al.tracks[0]}`
                        : `/api/library/cover/${al.tracks[0]}`;
                    return `
                        <a href="#/album/${encodeURIComponent(al.name)}${sourceQuery}" class="glass-card album-card" style="text-decoration: none; color: inherit;">
                            <img src="${cUrl}" style="width: 100%; aspect-ratio: 1; object-fit: cover;">
                            <div style="padding: 16px;">
                                <h3 style="font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${al.name}</h3>
                                <p class="text-secondary" style="font-size: 14px;">Album • ${al.tracks.length} titres</p>
                            </div>
                        </a>
                    `;
                }).join('')}
            </div>
        ` : ''}

        ${artistSingles.length > 0 ? `
            <h2 class="section-title">Singles & EPs</h2>
            <div class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 24px; margin-bottom: 48px;">
                ${artistSingles.map(al => {
                    const fullTrack = tracks.find((t) => t.id === al.tracks[0]);
                    const cUrl = source === 'jellyfin'
                        ? `/api/jellyfin/cover/${fullTrack?.albumId || al.tracks[0]}`
                        : `/api/library/cover/${al.tracks[0]}`;
                    return `
                        <div class="glass-card single-card" data-tid="${al.tracks[0]}" style="cursor: pointer;">
                            <img src="${cUrl}" style="width: 100%; aspect-ratio: 1; object-fit: cover;">
                            <div style="padding: 16px;">
                                <h3 style="font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${al.name}</h3>
                                <p class="text-secondary" style="font-size: 14px;">Single</p>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        ` : ''}
    `;

    container.innerHTML = html;

    container.querySelectorAll('.single-card').forEach((card) => {
        card.addEventListener('click', () => {
            const track = tracks.find((t) => t.id === card.dataset.tid);
            if (track) Player.playTrack(track, [track], 0);
        });
    });
}
