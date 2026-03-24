import { Api, AppState } from '../api.js';
import { Player } from '../player/player.js';

export async function renderHome(container) {
    container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>'; // Loading state

    try {
        const topPlayed = await Api.getTopPlayed(6);
        
        let html = `
            <h1 class="page-title">Accueil</h1>
            <p class="text-secondary" style="margin-bottom: 32px; font-size: 18px;">Bon retour sur MayWiFin.</p>
            
            <h2 class="section-title">Les plus écoutés</h2>
            <div class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 24px;">
        `;

        if (topPlayed.length === 0) {
            html += `<p class="text-muted">Aucune donnée d'écoute pour le moment.</p>`;
        } else {
            topPlayed.forEach(track => {
                // Determine cover based on id prefix. For Jellyfin, id might be trackId but we need album id preferably. 
                // Since play_counts only stores 'id', we assume `local_` or raw JF id. Covers for JF tracks directly might work.
                let coverUrl = track.id.startsWith('local_') 
                    ? `/api/library/cover/${track.id}` 
                    : `/api/jellyfin/cover/${track.id}`;
                
                html += `
                    <div class="glass-card play-track-card" data-id="${track.id}" data-title="${track.title}" data-artist="${track.artist}">
                        <img src="${coverUrl}" alt="${track.title}" style="width: 100%; aspect-ratio: 1; object-fit: cover;">
                        <div style="padding: 16px;">
                            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${track.title}</h3>
                            <p class="text-secondary" style="font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${track.artist}</p>
                            <p class="text-muted" style="font-size: 12px; margin-top: 8px;">${track.count} écoutes</p>
                        </div>
                    </div>
                `;
            });
        }

        html += `
            </div>

            <div style="margin-top: 48px; padding: 32px; border-radius: var(--radius-lg); background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0) 100%);">
                <h2 style="font-size: 24px; margin-bottom: 16px;">Bienvenue sur MayWiFin</h2>
                <p class="text-secondary" style="margin-bottom: 24px; line-height: 1.6;">Votre interface unifiée pour votre musique locale et votre serveur Jellyfin. Configurez vos sources dans les paramètres pour commencer à écouter.</p>
                <a href="#/settings" class="nav-btn" style="display: inline-flex; background: var(--accent); color: var(--bg-base); padding: 12px 24px;">Aller aux Paramètres</a>
            </div>
        `;

        container.innerHTML = html;

        // Bind Play events
        container.querySelectorAll('.play-track-card').forEach(card => {
            card.addEventListener('click', () => {
                const track = {
                    id: card.dataset.id,
                    title: card.dataset.title,
                    artist: card.dataset.artist,
                    type: card.dataset.id.startsWith('local_') ? 'local' : 'jellyfin'
                };
                Player.playTrack(track, [track], 0);
            });
        });

    } catch (err) {
        container.innerHTML = `<div class="error-msg">Erreur de chargement: ${err.message}</div>`;
    }
}
