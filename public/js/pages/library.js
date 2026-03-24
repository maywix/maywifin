import { Api, AppState } from '../api.js';
import { Player } from '../player/player.js';

export async function renderLibrary(container) {
    if (Object.keys(AppState.library.artists).length === 0) {
        // Try fetching
        container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
        try {
            const data = await Api.getLocalLibrary();
            AppState.library = data;
        } catch (e) {
            console.error("Failed to load local library", e);
        }
    }

    const { artists, albums, tracks } = AppState.library;
    
    // Sort logic
    const artistNames = Object.keys(artists).sort();

    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
            <h1 class="page-title" style="margin-bottom: 0;">Bibliothèque</h1>
            <input type="text" id="lib-search" placeholder="Rechercher..." style="padding: 12px 24px; border-radius: var(--radius-full); border: 1px solid var(--bg-elevated); background: var(--bg-surface); color: white; width: 300px;">
        </div>

        <div class="tabs" style="display: flex; gap: 16px; margin-bottom: 32px; border-bottom: 1px solid var(--bg-elevated); padding-bottom: 16px;">
            <button class="tab-btn active" data-tab="artists" style="background: none; border: none; color: var(--accent); font-size: 18px; font-weight: 600; cursor: pointer;">Artistes</button>
            <button class="tab-btn" data-tab="albums" style="background: none; border: none; color: var(--text-secondary); font-size: 18px; font-weight: 600; cursor: pointer;">Albums</button>
            <button class="tab-btn" data-tab="tracks" style="background: none; border: none; color: var(--text-secondary); font-size: 18px; font-weight: 600; cursor: pointer;">Pistes</button>
        </div>

        <div id="tab-content"></div>
    `;

    container.innerHTML = html;

    const tabContent = document.getElementById('tab-content');
    
    function renderArtists() {
        if (artistNames.length === 0) return tabContent.innerHTML = '<p class="text-muted">Aucun artiste trouvé. Avez-vous scanné votre dossier local?</p>';
        
        let gridHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 24px;">';
        artistNames.forEach(name => {
            const artist = artists[name];
            // Get first track of first album for an artist cover
            let coverUrl = '/assets/default-cover.png';
            if (artist.albums.length > 0 && albums[artist.albums[0]] && albums[artist.albums[0]].tracks.length > 0) {
                coverUrl = `/api/library/cover/${albums[artist.albums[0]].tracks[0]}`;
            }

            gridHtml += `
                <div class="glass-card artist-card" style="text-align: center; border-radius: var(--radius-full); padding: 16px;">
                    <img src="${coverUrl}" style="width: 100%; aspect-ratio: 1; border-radius: 50%; object-fit: cover; margin-bottom: 16px; box-shadow: 0 8px 16px rgba(0,0,0,0.4);">
                    <h3 style="font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</h3>
                </div>
            `;
        });
        gridHtml += '</div>';
        tabContent.innerHTML = gridHtml;
    }

    function renderAlbums() {
        const albumNames = Object.keys(albums).sort();
        if (albumNames.length === 0) return tabContent.innerHTML = '<p class="text-muted">Aucun album trouvé.</p>';
        
        let gridHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 24px;">';
        albumNames.forEach(name => {
            const album = albums[name];
            let coverUrl = album.tracks.length > 0 ? `/api/library/cover/${album.tracks[0]}` : '/assets/default-cover.png';

            gridHtml += `
                <div class="glass-card album-card" style="padding: 0;">
                    <img src="${coverUrl}" style="width: 100%; aspect-ratio: 1; object-fit: cover;">
                    <div style="padding: 16px;">
                        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</h3>
                        <p class="text-secondary" style="font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${album.artist}</p>
                    </div>
                </div>
            `;
        });
        gridHtml += '</div>';
        tabContent.innerHTML = gridHtml;
    }

    function renderTracks() {
        if (tracks.length === 0) return tabContent.innerHTML = '<p class="text-muted">Aucune piste trouvée.</p>';
        
        // Render as a generic list
        let listHtml = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        tracks.forEach((track, index) => {
            const m = Math.floor(track.duration / 60);
            const s = Math.floor(track.duration % 60).toString().padStart(2, '0');
            
            listHtml += `
                <div class="track-row play-track-row" data-index="${index}" style="display: flex; align-items: center; padding: 12px 16px; border-radius: var(--radius-sm); transition: background 0.2s; cursor: pointer;">
                    <div style="flex: 1; display: flex; flex-direction: column;">
                        <span style="font-weight: 500;">${track.title}</span>
                        <span class="text-secondary" style="font-size: 13px;">${track.artist} • ${track.album}</span>
                    </div>
                    <span class="text-muted" style="font-variant-numeric: tabular-nums;">${m}:${s}</span>
                </div>
            `;
        });
        listHtml += '</div>';
        tabContent.innerHTML = listHtml;

        // Hover effect via CSS (add to main if missing, doing inline here for simplicity)
        tabContent.querySelectorAll('.track-row').forEach(row => {
            row.addEventListener('mouseenter', () => row.style.backgroundColor = 'var(--bg-elevated)');
            row.addEventListener('mouseleave', () => row.style.backgroundColor = 'transparent');
            
            row.addEventListener('click', () => {
                const idx = parseInt(row.dataset.index);
                Player.playTrack(tracks[idx], tracks, idx);
            });
        });
    }

    // Default Tab
    renderArtists();

    // Tab Switching Logic
    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            container.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('active');
                b.style.color = 'var(--text-secondary)';
            });
            e.target.classList.add('active');
            e.target.style.color = 'var(--accent)';

            const tab = e.target.dataset.tab;
            if (tab === 'artists') renderArtists();
            if (tab === 'albums') renderAlbums();
            if (tab === 'tracks') renderTracks();
        });
    });
}
