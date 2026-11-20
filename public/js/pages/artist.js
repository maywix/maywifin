import { Api, AppState } from '../api.js';
import { Player } from '../player/player.js';
import { loadJellyfinLibrary } from '../jellyfin-helpers.js';

function getSourceFromHash() {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex === -1) return 'local';
    const params = new URLSearchParams(hash.substring(queryIndex + 1));
    return params.get('source') === 'jellyfin' ? 'jellyfin' : 'local';
}

export async function renderArtist(container, params) {
    const artistName = decodeURIComponent(params.id);
    const source = getSourceFromHash();

    container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';

    try {
        if (source === 'jellyfin') {
            if (!AppState.jellyfin.tracks || AppState.jellyfin.tracks.length === 0) {
                AppState.jellyfin = await loadJellyfinLibrary();
            }
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
            coverUrl = Api.withAuth(`/api/jellyfin/cover/${fullTrack?.albumId || coverTrackId}`);
        } else {
            coverUrl = Api.withAuth(`/api/library/cover/${coverTrackId}`);
        }
    }

    const sourceQuery = `?source=${source}`;

    let html = `
        <button id="btn-back" class="btn-back"><span class="material-symbols-rounded">arrow_back</span> Retour</button>
        <div style="display: flex; align-items: flex-end; gap: 28px; margin-bottom: 44px; flex-wrap: wrap;">
            <img src="${coverUrl}" style="width: 180px; height: 180px; border-radius: 50%; object-fit: cover; box-shadow: var(--shadow-lg);">
            <div>
                <p class="text-secondary text-xs" style="font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Artiste</p>
                <h1 class="page-title" style="font-size: 44px;">${artistName}</h1>
            </div>
        </div>

        ${artistAlbums.length > 0 ? `
            <h2 class="section-title">Albums</h2>
            <div class="card-grid" style="margin-bottom: 44px;">
                ${artistAlbums.map(al => {
                    const fullTrack = tracks.find((t) => t.id === al.tracks[0]);
                    const cUrl = Api.withAuth(source === 'jellyfin'
                        ? `/api/jellyfin/cover/${fullTrack?.albumId || al.tracks[0]}`
                        : `/api/library/cover/${al.tracks[0]}`);
                    return `
                        <a href="#/album/${encodeURIComponent(al.name)}${sourceQuery}" class="glass-card">
                            <img src="${cUrl}">
                            <div class="card-body">
                                <h3>${al.name}</h3>
                                <p>Album • ${al.tracks.length} titres</p>
                            </div>
                        </a>
                    `;
                }).join('')}
            </div>
        ` : ''}

        ${artistSingles.length > 0 ? `
            <h2 class="section-title">Singles & EPs</h2>
            <div class="card-grid" style="margin-bottom: 44px;">
                ${artistSingles.map(al => {
                    const fullTrack = tracks.find((t) => t.id === al.tracks[0]);
                    const cUrl = Api.withAuth(source === 'jellyfin'
                        ? `/api/jellyfin/cover/${fullTrack?.albumId || al.tracks[0]}`
                        : `/api/library/cover/${al.tracks[0]}`);
                    return `
                        <div class="glass-card single-card" data-tid="${al.tracks[0]}">
                            <img src="${cUrl}">
                            <div class="card-body">
                                <h3>${al.name}</h3>
                                <p>Single</p>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        ` : ''}
    `;

    container.innerHTML = html;

    document.getElementById('btn-back').addEventListener('click', () => window.history.back());

    container.querySelectorAll('.single-card').forEach((card) => {
        card.addEventListener('click', () => {
            const track = tracks.find((t) => t.id === card.dataset.tid);
            if (track) Player.playTrack(track, [track], 0);
        });
    });
}
