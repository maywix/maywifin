import { Api, AppState } from '../api.js';
import { Player } from '../player/player.js';

export async function renderRadio(container) {
    if (Object.keys(AppState.library.tracks).length === 0) {
        container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
        try {
            AppState.library = await Api.getLocalLibrary();
        } catch (e) {
            return container.innerHTML = '<div class="error-msg">Erreur de chargement de la bibliothèque pour la radio.</div>';
        }
    }

    const { tracks } = AppState.library;

    const genres = {};
    tracks.forEach(t => {
        let g = t.genre || 'Inconnu';
        g = g.replace(/\\(.*?\\)|\\[.*?\\]/g, '').trim();
        if (!g) g = 'Inconnu';

        if (!genres[g]) genres[g] = [];
        genres[g].push(t);
    });

    const sortedGenres = Object.keys(genres).sort((a,b) => genres[b].length - genres[a].length);

    let html = `
        <p class="text-secondary text-xs" style="font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Automix 24/7</p>
        <h1 class="page-title">Stations Radio</h1>
        <p class="page-subtitle">Lancez une station basée sur vos genres favoris. La lecture sera aléatoire et infinie.</p>

        <div class="card-grid">
    `;

    if (sortedGenres.length === 0) {
         html += '<div class="empty-state" style="grid-column: 1/-1;">Aucun genre trouvé.</div>';
    } else {
        sortedGenres.slice(0, 20).forEach((g) => {
            const count = genres[g].length;
            if (count < 2) return;

            const hue = (g.charCodeAt(0) * 12 + g.charCodeAt(g.length-1) * 7) % 360;
            const grad = `linear-gradient(135deg, hsl(${hue}, 65%, 26%), hsl(${(hue + 40)%360}, 55%, 13%))`;

            html += `
                <div class="glass-card radio-card" data-genre="${g}" style="--radio-grad: ${grad};">
                    <div class="card-body">
                        <span class="material-symbols-rounded radio-icon">radio</span>
                        <div class="radio-text">
                            <h3>${g}</h3>
                            <p>${count} titres</p>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.radio-card').forEach(card => {
        card.addEventListener('click', () => {
            const genre = card.dataset.genre;
            let tracksToPlay = [...genres[genre]];

            for (let i = tracksToPlay.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tracksToPlay[i], tracksToPlay[j]] = [tracksToPlay[j], tracksToPlay[i]];
            }

            Player.playTrack(tracksToPlay[0], tracksToPlay, 0);

            card.style.transform = 'scale(0.96)';
            setTimeout(() => card.style.transform = '', 150);
        });
    });
}
