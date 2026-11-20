import { Api, AppState } from '../api.js';
import { Player } from '../player/player.js';
import { renderFormatBadges } from '../components/format-badges.js';
import { loadJellyfinLibrary } from '../jellyfin-helpers.js';

let jellyfinLoadPromise = null;
// Remembers the last Local/Jellyfin choice (and active sub-tab) across navigations within
// the session - e.g. going back from a Jellyfin album used to always land back on "Local"
// regardless of what you were actually browsing before.
let rememberedSource = 'local';
let rememberedTab = 'artists';

// Loads Jellyfin's library on demand (only when the user actually switches to that tab)
// instead of always fetching it up front - it's a network round-trip to a possibly slow/
// remote server, and most sessions never leave the Local tab. Memoized so switching tabs
// back and forth doesn't refetch, and concurrent switches share the same in-flight request.
async function ensureJellyfinLoaded() {
    if (AppState.jellyfin.tracks && AppState.jellyfin.tracks.length > 0) return;
    if (!jellyfinLoadPromise) {
        jellyfinLoadPromise = loadJellyfinLibrary()
            .then((lib) => { AppState.jellyfin = lib; })
            .catch((e) => { console.error('Failed to load Jellyfin library', e); jellyfinLoadPromise = null; });
    }
    await jellyfinLoadPromise;
}

export async function renderLibrary(container) {
    // Only the local library (a fast local DB read) loads up front - see
    // ensureJellyfinLoaded above for why Jellyfin itself is deferred.
    if (Object.keys(AppState.library.artists).length === 0) {
        container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
        try {
            AppState.library = await Api.getLocalLibrary();
        } catch (e) {
            console.error('Failed to load local library', e);
        }
    }

    let currentSource = rememberedSource;

    function getCurrentData() {
        const data = currentSource === 'jellyfin' ? AppState.jellyfin : AppState.library;
        return {
            artists: data.artists || {},
            albums: data.albums || {},
            tracks: data.tracks || []
        };
    }

    let html = `
        <div class="page-header">
            <div>
                <h1 class="page-title">Bibliothèque</h1>
            </div>
            <input type="text" id="lib-search" class="input" placeholder="Rechercher..." style="width: 280px;">
        </div>

        <div class="pill-tabs">
            <button class="pill-tab ${currentSource === 'local' ? 'active' : ''}" data-source="local">Local</button>
            <button class="pill-tab ${currentSource === 'jellyfin' ? 'active' : ''}" data-source="jellyfin">Jellyfin</button>
        </div>

        <div class="tabs">
            <button class="tab-btn ${rememberedTab === 'artists' ? 'active' : ''}" data-tab="artists">Artistes</button>
            <button class="tab-btn ${rememberedTab === 'albums' ? 'active' : ''}" data-tab="albums">Albums</button>
            <button class="tab-btn ${rememberedTab === 'tracks' ? 'active' : ''}" data-tab="tracks">Pistes</button>
        </div>

        <div id="tab-content"></div>
    `;

    container.innerHTML = html;

    const tabContent = document.getElementById('tab-content');
    let currentTab = rememberedTab;
    let searchQuery = '';

    function matchesSearch(text) {
        if (!searchQuery) return true;
        return (text || '').toLowerCase().includes(searchQuery);
    }

    function coverForTrackId(trackId, albums, tracks) {
        if (currentSource === 'jellyfin') {
            const fullTrack = tracks.find((t) => t.id === trackId);
            return Api.withAuth(`/api/jellyfin/cover/${fullTrack?.albumId || trackId}`);
        }
        return Api.withAuth(`/api/library/cover/${trackId}`);
    }

    function renderTab() {
        if (currentTab === 'artists') renderArtists();
        if (currentTab === 'albums') renderAlbums();
        if (currentTab === 'tracks') renderTracks();
    }

    function renderArtists() {
        const { artists, albums, tracks } = getCurrentData();
        const artistNames = Object.keys(artists).filter((name) => matchesSearch(name)).sort();
        if (artistNames.length === 0) {
            return tabContent.innerHTML = `<div class="empty-state">${searchQuery ? `Aucun artiste pour "${searchQuery}".` : 'Aucun artiste trouvé. Avez-vous scanné votre dossier local ?'}</div>`;
        }

        let gridHtml = '<div class="card-grid">';
        artistNames.forEach(name => {
            const artist = artists[name];
            let coverUrl = '/assets/default-cover.png';
            if (artist.albums.length > 0 && albums[artist.albums[0]] && albums[artist.albums[0]].tracks.length > 0) {
                coverUrl = coverForTrackId(albums[artist.albums[0]].tracks[0], albums, tracks);
            }

            gridHtml += `
                <a href="#/artist/${encodeURIComponent(name)}?source=${currentSource}" class="glass-card artist-card">
                    <img src="${coverUrl}">
                    <div class="card-body">
                        <h3>${name}</h3>
                        <p>Artiste</p>
                    </div>
                </a>
            `;
        });
        gridHtml += '</div>';
        tabContent.innerHTML = gridHtml;
    }

    function renderAlbums() {
        const { albums, tracks } = getCurrentData();
        const albumNames = Object.keys(albums)
            .filter((name) => matchesSearch(name) || matchesSearch(albums[name].artist))
            .sort();
        if (albumNames.length === 0) {
            return tabContent.innerHTML = `<div class="empty-state">${searchQuery ? `Aucun album pour "${searchQuery}".` : 'Aucun album trouvé.'}</div>`;
        }

        let gridHtml = '<div class="card-grid">';
        albumNames.forEach(name => {
            const album = albums[name];
            let coverUrl = album.tracks.length > 0 ? coverForTrackId(album.tracks[0], albums, tracks) : '/assets/default-cover.png';

            gridHtml += `
                <a href="#/album/${encodeURIComponent(name)}?source=${currentSource}" class="glass-card">
                    <img src="${coverUrl}">
                    <div class="card-body">
                        <h3>${name}</h3>
                        <p>${album.artist}</p>
                    </div>
                </a>
            `;
        });
        gridHtml += '</div>';
        tabContent.innerHTML = gridHtml;
    }

    function renderTracks() {
        const { tracks: allTracks } = getCurrentData();
        const tracks = allTracks.filter((t) =>
            matchesSearch(t.title) || matchesSearch(t.artist) || matchesSearch(t.album)
        );
        if (tracks.length === 0) {
            return tabContent.innerHTML = `<div class="empty-state">${searchQuery ? `Aucune piste pour "${searchQuery}".` : 'Aucune piste trouvée.'}</div>`;
        }

        let listHtml = '<div class="track-list">';
        tracks.forEach((track, index) => {
            const m = Math.floor(track.duration / 60);
            const s = Math.floor(track.duration % 60).toString().padStart(2, '0');

            listHtml += `
                <div class="track-row play-track-row" data-index="${index}">
                    <span class="material-symbols-rounded text-muted" style="font-size: 20px;">play_arrow</span>
                    <div class="track-main">
                        <span class="track-title">${track.title}${renderFormatBadges(track)}</span>
                        <span class="track-meta">${track.artist} • ${track.album}</span>
                    </div>
                    <button class="icon-btn btn-like-track"><span class="material-symbols-rounded" style="font-size: 20px;">favorite</span></button>
                    <span class="track-time">${m}:${s}</span>
                </div>
            `;
        });
        listHtml += '</div>';
        tabContent.innerHTML = listHtml;

        tabContent.querySelectorAll('.play-track-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.btn-like-track')) return;

                const idx = parseInt(row.dataset.index);
                const playList = tracks.map((t) => ({ ...t, type: currentSource === 'jellyfin' ? 'jellyfin' : 'local' }));
                Player.playTrack(playList[idx], playList, idx);
            });
        });

        tabContent.querySelectorAll('.btn-like-track').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.classList.toggle('btn-like-active');
                // TODO: Save to DB
            });
        });
    }

    if (currentSource === 'jellyfin') {
        tabContent.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
        await ensureJellyfinLoaded();
    }
    renderTab();

    document.getElementById('lib-search').addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        renderTab();
    });

    container.querySelectorAll('.pill-tab').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            currentSource = e.target.dataset.source;
            rememberedSource = currentSource;
            container.querySelectorAll('.pill-tab').forEach((b) => b.classList.toggle('active', b === e.target));

            if (currentSource === 'jellyfin') {
                tabContent.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
                await ensureJellyfinLoaded();
            }
            renderTab();
        });
    });

    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.dataset.tab;
            rememberedTab = currentTab;
            renderTab();
        });
    });
}
