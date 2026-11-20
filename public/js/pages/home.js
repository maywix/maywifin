import { Api, AppState } from '../api.js';
import { Player } from '../player/player.js';

// Stale-while-revalidate: render the previous result instantly (no loader flash) on
// repeat visits, then silently refresh in the background - only the very first visit
// this session waits on the network.
let cachedTopPlayed = null;

function renderHtml(container, topPlayed) {
    let html = `
        <h1 class="page-title">Accueil</h1>
        <p class="page-subtitle">Bon retour sur MayWiFin.</p>

        <h2 class="section-title">Les plus écoutés</h2>
        <div class="card-grid">
    `;

    if (topPlayed.length === 0) {
        html += `<div class="empty-state" style="grid-column: 1/-1;">Aucune donnée d'écoute pour le moment.</div>`;
    } else {
        topPlayed.forEach(track => {
            let coverUrl = Api.withAuth(track.id.startsWith('local_')
                ? `/api/library/cover/${track.id}`
                : `/api/jellyfin/cover/${track.id}`);

            html += `
                <div class="glass-card play-track-card" data-id="${track.id}" data-title="${track.title}" data-artist="${track.artist}">
                    <img src="${coverUrl}" alt="${track.title}">
                    <div class="card-body">
                        <h3>${track.title}</h3>
                        <p>${track.artist}</p>
                        <p class="card-count text-muted text-xs">${track.count} écoutes</p>
                    </div>
                </div>
            `;
        });
    }

    html += `
        </div>

        <div class="panel" style="margin-top: 40px; padding: 32px; background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%);">
            <h2 style="font-size: 22px; margin-bottom: 12px;">Bienvenue sur MayWiFin</h2>
            <p class="text-secondary" style="margin-bottom: 22px; line-height: 1.6; max-width: 560px;">Votre interface unifiée pour votre musique locale et votre serveur Jellyfin. Configurez vos sources dans Admin pour commencer à écouter.</p>
            <a href="#/admin" class="btn btn-primary">Aller à Admin</a>
        </div>
    `;

    container.innerHTML = html;

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
}

export async function renderHome(container) {
    if (cachedTopPlayed) {
        renderHtml(container, cachedTopPlayed);
        // Refresh quietly in the background; only re-render if it actually changed.
        Api.getTopPlayed(6).then((fresh) => {
            if (JSON.stringify(fresh) !== JSON.stringify(cachedTopPlayed)) {
                cachedTopPlayed = fresh;
                if (window.location.hash === '#/' || window.location.hash === '') {
                    renderHtml(container, fresh);
                }
            }
        }).catch(() => {});
        return;
    }

    container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
    try {
        const topPlayed = await Api.getTopPlayed(6);
        cachedTopPlayed = topPlayed;
        renderHtml(container, topPlayed);
    } catch (err) {
        container.innerHTML = `<div class="error-msg">Erreur de chargement: ${err.message}</div>`;
    }
}
