import { Api, AppState } from '../api.js';
import { Player } from '../player/player.js';

export async function renderAlbum(container, params) {
    const albumName = decodeURIComponent(params.id);
    
    if (Object.keys(AppState.library.albums).length === 0) {
        container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
        try {
            AppState.library = await Api.getLocalLibrary();
        } catch (e) {
            return container.innerHTML = '<div class="error-msg">Erreur de chargement.</div>';
        }
    }

    const { albums, tracks } = AppState.library;
    const album = albums[albumName];

    if (!album) {
        return container.innerHTML = '<h2 class="page-title">Album introuvable</h2>';
    }

    // Map track IDs to track objects and sort by track number
    const albumTracks = album.tracks.map(tid => tracks.find(t => t.id === tid)).filter(Boolean);
    albumTracks.sort((a, b) => (a.track_no || 0) - (b.track_no || 0));

    const coverUrl = albumTracks.length > 0 ? `/api/library/cover/${albumTracks[0].id}` : '/assets/default-cover.png';
    const totalDuration = albumTracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    const m = Math.floor(totalDuration / 60);

    let html = `
        <div style="display: flex; align-items: flex-end; gap: 32px; margin-bottom: 48px;">
            <img src="${coverUrl}" style="width: 240px; height: 240px; border-radius: var(--radius-md); object-fit: cover; box-shadow: 0 16px 32px rgba(0,0,0,0.5);">
            <div>
                <p class="text-secondary" style="font-weight: 600; text-transform: uppercase; letter-spacing: 2px;">Album</p>
                <h1 class="page-title" style="margin-bottom: 8px; font-size: 64px;">${albumName}</h1>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 16px;">
                    <a href="#/artist/${encodeURIComponent(album.artist)}" style="color: var(--text-primary); text-decoration: none; font-weight: 600;" class="hover-underline">${album.artist}</a>
                    <span class="text-muted">•</span>
                    <span class="text-secondary">${albumTracks.length} titres, ${m} min</span>
                </div>
                
                <div style="margin-top: 24px; display: flex; gap: 16px;">
                    <button id="btn-play-album" style="width: 56px; height: 56px; border-radius: 50%; border: none; background: var(--accent); color: var(--bg-base); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s;">
                        <span class="material-symbols-rounded" style="font-size: 32px;">play_arrow</span>
                    </button>
                    <button style="width: 56px; height: 56px; border-radius: 50%; border: 1px solid var(--text-secondary); background: transparent; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <span class="material-symbols-rounded">favorite_border</span>
                    </button>
                    <button style="width: 56px; height: 56px; border-radius: 50%; border: 1px solid var(--text-secondary); background: transparent; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        <span class="material-symbols-rounded">more_horiz</span>
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
                ${albumTracks.map((t, i) => {
                    const sm = Math.floor((t.duration||0) / 60);
                    const ss = Math.floor((t.duration||0) % 60).toString().padStart(2, '0');
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
                }).join('')}
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Hover effect
    container.querySelectorAll('.track-row').forEach(row => {
        row.addEventListener('mouseenter', () => row.style.backgroundColor = 'var(--bg-elevated)');
        row.addEventListener('mouseleave', () => row.style.backgroundColor = 'transparent');
        
        row.addEventListener('click', () => {
            const idx = parseInt(row.dataset.index);
            Player.playTrack(albumTracks[idx], albumTracks, idx);
        });
    });

    // Play button
    document.getElementById('btn-play-album').addEventListener('click', () => {
        if (albumTracks.length > 0) {
            Player.playTrack(albumTracks[0], albumTracks, 0);
        }
    });
}
