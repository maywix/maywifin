import { Api, AppState } from '../api.js';
import { Player } from '../player/player.js';

export async function renderArtist(container, params) {
    const artistName = decodeURIComponent(params.id);
    
    // Ensure library is loaded
    if (Object.keys(AppState.library.artists).length === 0) {
        container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
        try {
            AppState.library = await Api.getLocalLibrary();
        } catch (e) {
            return container.innerHTML = '<div class="error-msg">Erreur de chargement.</div>';
        }
    }

    const { artists, albums, tracks } = AppState.library;
    const artist = artists[artistName];

    if (!artist) {
        return container.innerHTML = '<h2 class="page-title">Artiste introuvable</h2>';
    }

    // Sort into Albums (>1 track) vs Singles (1 track)
    let artistAlbums = [];
    let artistSingles = [];

    artist.albums.forEach(albumName => {
        const al = albums[albumName];
        if (al) {
            // Check if track count
            if (al.tracks.length > 1) {
                artistAlbums.push(al);
            } else if (al.tracks.length === 1) {
                // Determine if it's meant to be an album or single based on length or common naming?
                // By user request: mostly 1 track = single, >1 = album
                artistSingles.push(al);
            }
        }
    });

    // We can't strictly sort by date if we didn't store year per album easily, but we can try if metadata exists. For now, name sorting.
    artistAlbums.sort((a,b) => a.name.localeCompare(b.name));
    artistSingles.sort((a,b) => a.name.localeCompare(b.name));

    // Get a cover image
    let coverUrl = '/assets/default-cover.png';
    if (artistAlbums.length > 0 && artistAlbums[0].tracks.length > 0) {
        coverUrl = `/api/library/cover/${artistAlbums[0].tracks[0]}`;
    } else if (artistSingles.length > 0 && artistSingles[0].tracks.length > 0) {
        coverUrl = `/api/library/cover/${artistSingles[0].tracks[0]}`;
    }

    // Top tracks by this artist
    let topTracksHtml = '<div class="spinner"></div>';
    
    // Render top HTML immediately, fetch top tracks async
    let html = `
        <div style="display: flex; align-items: flex-end; gap: 32px; margin-bottom: 48px;">
            <img src="${coverUrl}" style="width: 200px; height: 200px; border-radius: 50%; object-fit: cover; box-shadow: 0 16px 32px rgba(0,0,0,0.5);">
            <div>
                <p class="text-secondary" style="font-weight: 600; text-transform: uppercase; letter-spacing: 2px;">Artiste</p>
                <h1 class="page-title" style="margin-bottom: 8px; font-size: 64px;">${artistName}</h1>
            </div>
        </div>

        <h2 class="section-title">Titres les plus écoutés</h2>
        <div id="artist-top-tracks" style="margin-bottom: 48px;">${topTracksHtml}</div>

        ${artistAlbums.length > 0 ? `
            <h2 class="section-title">Albums</h2>
            <div class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 24px; margin-bottom: 48px;">
                ${artistAlbums.map(al => {
                    const cUrl = al.tracks.length > 0 ? `/api/library/cover/${al.tracks[0]}` : '/assets/default-cover.png';
                    return `
                        <a href="#/album/${encodeURIComponent(al.name)}" class="glass-card album-card" style="text-decoration: none; color: inherit;">
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
                    const cUrl = al.tracks.length > 0 ? `/api/library/cover/${al.tracks[0]}` : '/assets/default-cover.png';
                    const fullTrack = tracks.find(t => t.id === al.tracks[0]);
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

    // Fetch and render top tracks
    const topContainer = document.getElementById('artist-top-tracks');
    try {
        const topPlayed = await Api.getTopByArtist(artistName, 5);
        if (topPlayed.length === 0) {
            topContainer.innerHTML = '<p class="text-muted">Aucune donnée d\'écoute.</p>';
        } else {
            let listHtml = '<div style="display: flex; flex-direction: column; gap: 8px;">';
            topPlayed.forEach((t, i) => {
                let c = t.id.startsWith('local_') ? `/api/library/cover/${t.id}` : `/api/jellyfin/cover/${t.id}`;
                listHtml += `
                    <div class="top-track-row play-top-track" data-id="${t.id}" data-title="${t.title}" data-artist="${t.artist}" style="display: flex; align-items: center; gap: 16px; padding: 8px; border-radius: var(--radius-sm); cursor: pointer;">
                        <span class="text-muted" style="width: 20px; text-align: right;">${i+1}</span>
                        <img src="${c}" style="width: 40px; height: 40px; border-radius: 4px;">
                        <span style="flex: 1; font-weight: 500;">${t.title}</span>
                        <span class="text-muted" style="font-variant-numeric: tabular-nums;">${t.count} écoutes</span>
                    </div>
                `;
            });
            listHtml += '</div>';
            topContainer.innerHTML = listHtml;

            // Bind play
            topContainer.querySelectorAll('.play-top-track').forEach(row => {
                row.addEventListener('click', () => {
                    const track = {
                        id: row.dataset.id,
                        title: row.dataset.title,
                        artist: row.dataset.artist,
                        type: row.dataset.id.startsWith('local_') ? 'local' : 'jellyfin'
                    };
                    Player.playTrack(track, [track], 0);
                });
                row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-elevated)');
                row.addEventListener('mouseleave', () => row.style.background = 'transparent');
            });
        }
    } catch(err) {
        topContainer.innerHTML = '<p class="error-msg">Erreur de chargement des statistiques.</p>';
    }

    // Bind singles play
    container.querySelectorAll('.single-card').forEach(card => {
        card.addEventListener('click', () => {
            const track = tracks.find(t => t.id === card.dataset.tid);
            if (track) Player.playTrack(track, [track], 0);
        });
    });
}
