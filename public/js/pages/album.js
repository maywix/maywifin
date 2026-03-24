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

export async function renderAlbum(container, params) {
    const albumName = decodeURIComponent(params.id);
    const source = getSourceFromHash();

    container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';

    try {
        if (source === 'jellyfin') {
            const jellyfinRaw = await Api.getJellyfinTracks();
            AppState.jellyfin = buildLibraryFromTracks(normalizeJellyfinTracks(jellyfinRaw));
        } else if (Object.keys(AppState.library.albums).length === 0) {
            AppState.library = await Api.getLocalLibrary();
        }
    } catch (e) {
        return (container.innerHTML = '<div class="error-msg">Erreur de chargement.</div>');
    }

    const currentLib = source === 'jellyfin' ? AppState.jellyfin : AppState.library;
    const { albums, tracks } = currentLib;
    const album = albums[albumName];

    if (!album) {
        return (container.innerHTML = '<h2 class="page-title">Album introuvable</h2>');
    }

    const albumTracks = album.tracks
        .map((tid) => tracks.find((t) => t.id === tid))
        .filter(Boolean)
        .sort((a, b) => (a.track_no || 0) - (b.track_no || 0));

    const sourceQuery = `?source=${source}`;
    let coverUrl = '/assets/default-cover.png';
    if (albumTracks.length > 0) {
        if (source === 'jellyfin') {
            coverUrl = `/api/jellyfin/cover/${albumTracks[0].albumId || albumTracks[0].id}`;
        } else {
            coverUrl = `/api/library/cover/${albumTracks[0].id}`;
        }
    }

    const totalDuration = albumTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    const m = Math.floor(totalDuration / 60);

    const html = `
        <div style="display: flex; align-items: flex-end; gap: 32px; margin-bottom: 48px;">
            <img src="${coverUrl}" style="width: 240px; height: 240px; border-radius: var(--radius-md); object-fit: cover; box-shadow: 0 16px 32px rgba(0,0,0,0.5);">
            <div>
                <p class="text-secondary" style="font-weight: 600; text-transform: uppercase; letter-spacing: 2px;">Album</p>
                <h1 class="page-title" style="margin-bottom: 8px; font-size: 64px;">${albumName}</h1>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 16px;">
                    <a href="#/artist/${encodeURIComponent(album.artist)}${sourceQuery}" style="color: var(--text-primary); text-decoration: none; font-weight: 600;" class="hover-underline">${album.artist}</a>
                    <span class="text-muted">•</span>
                    <span class="text-secondary">${albumTracks.length} titres, ${m} min</span>
                </div>
                
                <div style="margin-top: 24px; display: flex; gap: 16px;">
                    <button id="btn-play-album" style="width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--accent); color: var(--bg-base); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s;">
                        <span class="material-symbols-rounded" style="font-size: 32px;">play_arrow</span>
                    </button>
                </div>
            </div>
        </div>

        <div style="margin-bottom: 32px;">
            <div style="display: flex; padding: 0 16px 8px 16px; border-bottom: 1px solid var(--bg-elevated); color: var(--text-muted); font-size: 13px; font-weight: 600; text-transform: uppercase;">
                <span style="width: 40px;">#</span>
                <span style="flex: 1;">Titre</span>
                <span style="width: 60px; text-align: right;"><span class="material-symbols-rounded" style="font-size: 18px;">schedule</span></span>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 16px;">
                ${albumTracks
                  .map((t, i) => {
                    const sm = Math.floor((t.duration || 0) / 60);
                    const ss = Math.floor((t.duration || 0) % 60)
                      .toString()
                      .padStart(2, '0');
                    return `
                        <div class="track-row play-album-track" data-index="${i}" style="display: flex; align-items: center; padding: 12px 16px; border-radius: var(--radius-sm); cursor: pointer; transition: background 0.2s;">
                            <span class="text-secondary" style="width: 40px;">${i + 1}</span>
                            <div style="flex: 1; display: flex; flex-direction: column;">
                                <span style="font-weight: 500;">${t.title}</span>
                                ${t.artist !== album.artist ? `<span class="text-secondary" style="font-size: 13px;">${t.artist}</span>` : ''}
                            </div>
                            <span class="text-secondary" style="width: 60px; text-align: right; font-variant-numeric: tabular-nums;">${sm}:${ss}</span>
                        </div>
                    `;
                  })
                  .join('')}
            </div>
        </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll('.track-row').forEach((row) => {
        row.addEventListener('mouseenter', () => {
            row.style.backgroundColor = 'var(--bg-elevated)';
        });
        row.addEventListener('mouseleave', () => {
            row.style.backgroundColor = 'transparent';
        });

        row.addEventListener('click', () => {
            const idx = parseInt(row.dataset.index, 10);
            Player.playTrack(albumTracks[idx], albumTracks, idx);
        });
    });

    document.getElementById('btn-play-album').addEventListener('click', () => {
        if (albumTracks.length > 0) {
            Player.playTrack(albumTracks[0], albumTracks, 0);
        }
    });
}
