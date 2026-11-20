import { Api, AppState } from '../api.js';
import { Player } from '../player/player.js';
import { renderFormatBadges } from '../components/format-badges.js';
import { loadJellyfinLibrary } from '../jellyfin-helpers.js';

function getSourceFromHash() {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex === -1) return 'local';
    const params = new URLSearchParams(hash.substring(queryIndex + 1));
    return params.get('source') === 'jellyfin' ? 'jellyfin' : 'local';
}

export async function renderAlbum(container, params) {
    const albumName = decodeURIComponent(params.id);
    const source = getSourceFromHash();

    container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';

    try {
        if (source === 'jellyfin') {
            // Cached like everywhere else - no reason to refetch Jellyfin's whole track
            // list on every single album visit within the same session.
            if (!AppState.jellyfin.tracks || AppState.jellyfin.tracks.length === 0) {
                AppState.jellyfin = await loadJellyfinLibrary();
            }
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
            coverUrl = Api.withAuth(`/api/jellyfin/cover/${albumTracks[0].albumId || albumTracks[0].id}`);
        } else {
            coverUrl = Api.withAuth(`/api/library/cover/${albumTracks[0].id}`);
        }
    }

    const totalDuration = albumTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    const m = Math.floor(totalDuration / 60);

    const html = `
        <button id="btn-back" class="btn-back"><span class="material-symbols-rounded">arrow_back</span> Retour</button>
        <div style="display: flex; align-items: flex-end; gap: 28px; margin-bottom: 40px; flex-wrap: wrap;">
            <img src="${coverUrl}" style="width: 200px; height: 200px; border-radius: var(--radius-md); object-fit: cover; box-shadow: var(--shadow-lg);">
            <div>
                <p class="text-secondary text-xs" style="font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Album</p>
                <h1 class="page-title" style="font-size: 44px;">${albumName}</h1>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 15px;">
                    <a href="#/artist/${encodeURIComponent(album.artist)}${sourceQuery}" class="hover-underline" style="font-weight: 600; text-decoration: none;">${album.artist}</a>
                    <span class="text-muted">•</span>
                    <span class="text-secondary">${albumTracks.length} titres, ${m} min</span>
                </div>

                <div style="margin-top: 20px;">
                    <button id="btn-play-album" class="btn btn-primary" style="width: 52px; height: 52px; border-radius: 50%; padding: 0;">
                        <span class="material-symbols-rounded" style="font-size: 28px;">play_arrow</span>
                    </button>
                </div>
            </div>
        </div>

        <div class="list-header">
            <span style="width: 40px;">#</span>
            <span style="flex: 1;">Titre</span>
            <span style="width: 60px; text-align: right;"><span class="material-symbols-rounded" style="font-size: 16px;">schedule</span></span>
        </div>

        <div class="track-list">
            ${albumTracks
              .map((t, i) => {
                const sm = Math.floor((t.duration || 0) / 60);
                const ss = Math.floor((t.duration || 0) % 60)
                  .toString()
                  .padStart(2, '0');
                return `
                    <div class="track-row play-album-track" data-index="${i}">
                        <span class="track-index">${i + 1}</span>
                        <div class="track-main">
                            <span class="track-title">${t.title}${renderFormatBadges(t)}</span>
                            ${t.artist !== album.artist ? `<span class="track-meta">${t.artist}</span>` : ''}
                        </div>
                        <span class="track-time">${sm}:${ss}</span>
                    </div>
                `;
              })
              .join('')}
        </div>
    `;

    container.innerHTML = html;

    document.getElementById('btn-back').addEventListener('click', () => window.history.back());

    container.querySelectorAll('.track-row').forEach((row) => {
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
