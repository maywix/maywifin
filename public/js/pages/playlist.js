import { AppState } from '../api.js';
import { Player } from '../player/player.js';

export async function renderPlaylist(container) {
    // Note: To persist playlists, we would use the DB endpoints.
    // In this prototype, we'll implement the UI logic for "Smart Sorts" requested by the user,
    // applying it to a generated 'Liked Tracks' or 'All Tracks' stub playlist.

    const { tracks } = AppState.library;

    if (!tracks || tracks.length === 0) {
        return container.innerHTML = `
            <h1 class="page-title">Playlists</h1>
            <div class="empty-state">La bibliothèque est vide.</div>
        `;
    }

    let currentPlaylist = [...tracks];

    function renderList() {
        let html = `
            <div class="page-header">
                <div>
                    <h1 class="page-title">Playlists (Démo)</h1>
                    <p class="text-secondary">Création et tri personnalisé "Artistique" (Artiste &gt; Album &gt; Piste)</p>
                </div>

                <div style="display: flex; gap: 10px; align-items: center;">
                    <span class="text-secondary text-sm">Trier par :</span>
                    <select id="sort-select" class="select" style="min-width: 220px;">
                        <option value="none">Défaut</option>
                        <option value="name">Titre (A-Z)</option>
                        <option value="artist">Artiste (A-Z)</option>
                        <option value="artistic">Tri Artistique (Artiste → Album → Piste)</option>
                    </select>
                </div>
            </div>

            <div class="track-list">
                ${currentPlaylist.map((t, i) => {
                    const m = Math.floor((t.duration||0) / 60);
                    const s = Math.floor((t.duration||0) % 60).toString().padStart(2, '0');
                    return `
                        <div class="track-row play-playlist-track" data-index="${i}">
                            <span class="track-index">${i + 1}</span>
                            <div class="track-main">
                                <span class="track-title">${t.title}</span>
                                <span class="track-meta">${t.artist} • ${t.album}</span>
                            </div>
                            <span class="track-time">${m}:${s}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        container.innerHTML = html;

        container.querySelectorAll('.track-row').forEach(row => {
            row.addEventListener('click', () => {
                const idx = parseInt(row.dataset.index);
                Player.playTrack(currentPlaylist[idx], currentPlaylist, idx);
            });
        });

        document.getElementById('sort-select').addEventListener('change', (e) => {
            applySort(e.target.value);
        });
    }

    function applySort(type) {
        if (type === 'name') {
            currentPlaylist.sort((a,b) => a.title.localeCompare(b.title));
        } else if (type === 'artist') {
            currentPlaylist.sort((a,b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
        } else if (type === 'artistic') {
            currentPlaylist.sort((a, b) => {
                const artistCmp = a.artist.localeCompare(b.artist);
                if (artistCmp !== 0) return artistCmp;

                const albumCmp = (a.album||'').localeCompare(b.album||'');
                if (albumCmp !== 0) return albumCmp;

                if (a.track_no !== undefined && b.track_no !== undefined) {
                    return a.track_no - b.track_no;
                }

                return a.title.localeCompare(b.title);
            });
        }
        renderList();
        document.getElementById('sort-select').value = type;
    }

    renderList();
}
