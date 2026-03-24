import { AppState } from '../api.js';
import { Player } from '../player/player.js';

export async function renderPlaylist(container) {
    // Note: To persist playlists, we would use the DB endpoints. 
    // In this prototype, we'll implement the UI logic for "Smart Sorts" requested by the user, 
    // applying it to a generated 'Liked Tracks' or 'All Tracks' stub playlist.

    const { tracks, artists, albums } = AppState.library;

    if (!tracks || tracks.length === 0) {
        return container.innerHTML = `
            <h1 class="page-title">Playlists</h1>
            <p class="text-muted">La bibliothèque est vide.</p>
        `;
    }

    // Default "All Tracks" for demo purposes until full DB playlist is wired
    let currentPlaylist = [...tracks]; 

    function renderList() {
        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 48px;">
                <div>
                    <h1 class="page-title" style="margin-bottom: 8px;">Playlists (Démo)</h1>
                    <p class="text-secondary" style="font-size: 16px;">Création et tri personnalisé "Artistique" (Artiste > Album > Piste)</p>
                </div>
                
                <div style="display: flex; gap: 12px; align-items: center;">
                    <span class="text-secondary">Trier par:</span>
                    <select id="sort-select" style="padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--bg-elevated); background: var(--bg-surface); color: white; cursor: pointer;">
                        <option value="none">Défaut</option>
                        <option value="name">Titre (A-Z)</option>
                        <option value="artist">Artiste (A-Z)</option>
                        <option value="artistic">Tri Artistique (Artiste -> Album -> Piste)</option>
                    </select>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 4px;">
                ${currentPlaylist.map((t, i) => {
                    const m = Math.floor((t.duration||0) / 60);
                    const s = Math.floor((t.duration||0) % 60).toString().padStart(2, '0');
                    return `
                        <div class="track-row play-playlist-track" data-index="${i}" style="display: flex; align-items: center; padding: 12px 16px; border-radius: var(--radius-sm); cursor: pointer;">
                            <span class="text-muted" style="width: 40px;">${i + 1}</span>
                            <div style="flex: 1; display: flex; flex-direction: column;">
                                <span style="font-weight: 500;">${t.title}</span>
                                <span class="text-secondary" style="font-size: 13px;">${t.artist} • ${t.album}</span>
                            </div>
                            <span class="text-secondary" style="font-variant-numeric: tabular-nums;">${m}:${s}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        container.innerHTML = html;

        // Hover effect & Play
        container.querySelectorAll('.track-row').forEach(row => {
            row.addEventListener('mouseenter', () => row.style.backgroundColor = 'var(--bg-elevated)');
            row.addEventListener('mouseleave', () => row.style.backgroundColor = 'transparent');
            
            row.addEventListener('click', () => {
                const idx = parseInt(row.dataset.index);
                Player.playTrack(currentPlaylist[idx], currentPlaylist, idx);
            });
        });

        // Bind Sort Change
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
            // The requested custom sorting: Artiste -> Album -> Track No / Title
            currentPlaylist.sort((a, b) => {
                const artistCmp = a.artist.localeCompare(b.artist);
                if (artistCmp !== 0) return artistCmp;
                
                const albumCmp = (a.album||'').localeCompare(b.album||'');
                if (albumCmp !== 0) return albumCmp;

                // Sort by track number if both exist, else alphabetically
                if (a.track_no !== undefined && b.track_no !== undefined) {
                    return a.track_no - b.track_no;
                }
                
                return a.title.localeCompare(b.title);
            });
        }
        renderList();
        
        // Restore dropdown value
        document.getElementById('sort-select').value = type;
    }

    renderList();
}
