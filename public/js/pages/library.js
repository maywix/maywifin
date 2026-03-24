import { Api, AppState } from '../api.js';
import { Player } from '../player/player.js';

export async function renderLibrary(container) {
    container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';

    try {
        if (Object.keys(AppState.library.artists).length === 0) {
            AppState.library = await Api.getLocalLibrary();
        }

        // Load Jellyfin data for display in library source switch
        if (!AppState.jellyfin.tracks || AppState.jellyfin.tracks.length === 0) {
            try {
                const jfTracksRaw = await Api.getJellyfinTracks();
                const jfItems = Array.isArray(jfTracksRaw) ? jfTracksRaw : (jfTracksRaw.Items || []);

                const jfTracks = jfItems.map((item) => ({
                    id: item.Id,
                    type: 'jellyfin',
                    title: item.Name || 'Unknown Title',
                    artist: (item.Artists && item.Artists[0]) || item.AlbumArtist || 'Unknown Artist',
                    album: item.Album || 'Unknown Album',
                    track_no: item.IndexNumber || null,
                    duration: item.RunTimeTicks ? item.RunTimeTicks / 10000000 : 0,
                    albumId: item.AlbumId || item.Id
                }));

                const jfArtists = {};
                const jfAlbums = {};

                jfTracks.forEach((track) => {
                    if (!jfArtists[track.artist]) {
                        jfArtists[track.artist] = { name: track.artist, albums: new Set() };
                    }
                    jfArtists[track.artist].albums.add(track.album);

                    if (!jfAlbums[track.album]) {
                        jfAlbums[track.album] = { name: track.album, artist: track.artist, tracks: [] };
                    }
                    jfAlbums[track.album].tracks.push(track.id);
                });

                Object.keys(jfArtists).forEach((artist) => {
                    jfArtists[artist].albums = Array.from(jfArtists[artist].albums);
                });

                AppState.jellyfin = {
                    artists: jfArtists,
                    albums: jfAlbums,
                    tracks: jfTracks
                };
            } catch (e) {
                console.error('Failed to load Jellyfin library', e);
            }
        }
    } catch (e) {
        console.error('Failed to load libraries', e);
    }

    const hasLocal = Object.keys(AppState.library.artists || {}).length > 0;
    const hasJellyfin = Object.keys(AppState.jellyfin.artists || {}).length > 0;
    let currentSource = hasLocal ? 'local' : (hasJellyfin ? 'jellyfin' : 'local');

    function getCurrentData() {
        const data = currentSource === 'jellyfin' ? AppState.jellyfin : AppState.library;
        return {
            artists: data.artists || {},
            albums: data.albums || {},
            tracks: data.tracks || []
        };
    }

    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
            <h1 class="page-title" style="margin-bottom: 0;">Bibliothèque</h1>
            <input type="text" id="lib-search" placeholder="Rechercher..." style="padding: 12px 24px; border-radius: var(--radius-full); border: 1px solid var(--bg-elevated); background: var(--bg-surface); color: white; width: 300px;">
        </div>

        <div class="tabs" style="display: flex; gap: 12px; margin-bottom: 16px;">
            <button class="source-btn ${currentSource === 'local' ? 'active' : ''}" data-source="local" style="padding: 10px 16px; border-radius: var(--radius-full); border: 1px solid var(--bg-elevated); background: ${currentSource === 'local' ? 'var(--accent)' : 'transparent'}; color: ${currentSource === 'local' ? 'var(--bg-base)' : 'var(--text-secondary)'}; font-weight: 600; cursor: pointer;">Local</button>
            <button class="source-btn ${currentSource === 'jellyfin' ? 'active' : ''}" data-source="jellyfin" style="padding: 10px 16px; border-radius: var(--radius-full); border: 1px solid var(--bg-elevated); background: ${currentSource === 'jellyfin' ? 'var(--accent)' : 'transparent'}; color: ${currentSource === 'jellyfin' ? 'var(--bg-base)' : 'var(--text-secondary)'}; font-weight: 600; cursor: pointer;">Jellyfin</button>
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
    let currentTab = 'artists';

    function coverForTrackId(trackId, albums, tracks) {
        if (currentSource === 'jellyfin') {
            const fullTrack = tracks.find((t) => t.id === trackId);
            return `/api/jellyfin/cover/${fullTrack?.albumId || trackId}`;
        }
        return `/api/library/cover/${trackId}`;
    }

    function renderTab() {
        if (currentTab === 'artists') renderArtists();
        if (currentTab === 'albums') renderAlbums();
        if (currentTab === 'tracks') renderTracks();
    }
    
    function renderArtists() {
        const { artists, albums, tracks } = getCurrentData();
        const artistNames = Object.keys(artists).sort();
        if (artistNames.length === 0) return tabContent.innerHTML = '<p class="text-muted">Aucun artiste trouvé. Avez-vous scanné votre dossier local?</p>';
        
        let gridHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 24px;">';
        artistNames.forEach(name => {
            const artist = artists[name];
            let coverUrl = '/assets/default-cover.png';
            if (artist.albums.length > 0 && albums[artist.albums[0]] && albums[artist.albums[0]].tracks.length > 0) {
                coverUrl = coverForTrackId(albums[artist.albums[0]].tracks[0], albums, tracks);
            }

            gridHtml += `
                <a href="#/artist/${encodeURIComponent(name)}" class="glass-card artist-card" style="text-align: center; padding: 24px; text-decoration: none; color: inherit;">
                    <img src="${coverUrl}" style="width: 100%; aspect-ratio: 1; border-radius: 50%; object-fit: cover; margin-bottom: 16px; box-shadow: 0 12px 24px rgba(0,0,0,0.5);">
                    <h3 style="font-size: 16px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</h3>
                    <p class="text-secondary" style="font-size: 13px; margin-top: 4px;">Artiste</p>
                </a>
            `;
        });
        gridHtml += '</div>';
        tabContent.innerHTML = gridHtml;
    }

    function renderAlbums() {
        const { albums, tracks } = getCurrentData();
        const albumNames = Object.keys(albums).sort();
        if (albumNames.length === 0) return tabContent.innerHTML = '<p class="text-muted">Aucun album trouvé.</p>';
        
        let gridHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 24px;">';
        albumNames.forEach(name => {
            const album = albums[name];
            let coverUrl = album.tracks.length > 0 ? coverForTrackId(album.tracks[0], albums, tracks) : '/assets/default-cover.png';

            gridHtml += `
                <a href="#/album/${encodeURIComponent(name)}" class="glass-card album-card" style="padding: 0; text-decoration: none; color: inherit;">
                    <img src="${coverUrl}" style="width: 100%; aspect-ratio: 1; object-fit: cover;">
                    <div style="padding: 16px;">
                        <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</h3>
                        <p class="text-secondary" style="font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${album.artist}</p>
                    </div>
                </a>
            `;
        });
        gridHtml += '</div>';
        tabContent.innerHTML = gridHtml;
    }

    function renderTracks() {
        const { tracks } = getCurrentData();
        if (tracks.length === 0) return tabContent.innerHTML = '<p class="text-muted">Aucune piste trouvée.</p>';
        
        let listHtml = '<div style="display: flex; flex-direction: column; gap: 4px;">';
        tracks.forEach((track, index) => {
            const m = Math.floor(track.duration / 60);
            const s = Math.floor(track.duration % 60).toString().padStart(2, '0');
            
            listHtml += `
                <div class="track-row play-track-row" data-index="${index}" style="display: flex; align-items: center; padding: 10px 16px; border-radius: var(--radius-sm); cursor: pointer; gap: 16px;">
                    <span class="material-symbols-rounded text-muted" style="font-size: 20px;">play_arrow</span>
                    <div style="flex: 1; display: flex; flex-direction: column;">
                        <span style="font-weight: 500;">${track.title}</span>
                        <span class="text-secondary" style="font-size: 13px;">${track.artist} • ${track.album}</span>
                    </div>
                    <button class="icon-btn btn-like-track" style="color: var(--text-muted); padding: 8px;"><span class="material-symbols-rounded" style="font-size: 20px;">favorite</span></button>
                    <span class="text-muted" style="font-variant-numeric: tabular-nums; width: 50px; text-align: right;">${m}:${s}</span>
                </div>
            `;
        });
        listHtml += '</div>';
        tabContent.innerHTML = listHtml;

        // Hover effect & Play
        tabContent.querySelectorAll('.play-track-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Ignore if clicked the like button specifically
                if (e.target.closest('.btn-like-track')) return;

                const idx = parseInt(row.dataset.index);
                const playList = tracks.map((t) => ({ ...t, type: currentSource === 'jellyfin' ? 'jellyfin' : 'local' }));
                Player.playTrack(playList[idx], playList, idx);
            });
        });

        // Bind Like Buttons
        tabContent.querySelectorAll('.btn-like-track').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.classList.toggle('btn-like-active');
                // TODO: Save to DB
            });
        });
    }

    // Default Tab
    renderTab();

    container.querySelectorAll('.source-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentSource = e.target.dataset.source;

            container.querySelectorAll('.source-btn').forEach((sourceBtn) => {
                const active = sourceBtn.dataset.source === currentSource;
                sourceBtn.style.background = active ? 'var(--accent)' : 'transparent';
                sourceBtn.style.color = active ? 'var(--bg-base)' : 'var(--text-secondary)';
            });

            renderTab();
        });
    });

    // Tab Switching Logic
    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            container.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('active');
                b.style.color = 'var(--text-secondary)';
            });
            e.target.classList.add('active');
            e.target.style.color = 'var(--accent)';

            currentTab = e.target.dataset.tab;
            renderTab();
        });
    });
}
