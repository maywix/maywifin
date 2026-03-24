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
    
    // Group tracks by genre
    const genres = {};
    tracks.forEach(t => {
        let g = t.genre || 'Inconnu';
        // Cleanup weird tags
        g = g.replace(/\\(.*?\\)|\\[.*?\\]/g, '').trim(); 
        if (!g) g = 'Inconnu';

        if (!genres[g]) genres[g] = [];
        genres[g].push(t);
    });

    const sortedGenres = Object.keys(genres).sort((a,b) => genres[b].length - genres[a].length);

    let html = `
        <div style="margin-bottom: 48px;">
            <p class="text-secondary" style="font-weight: 600; text-transform: uppercase; letter-spacing: 2px;">Automix 24/7</p>
            <h1 class="page-title" style="margin-bottom: 8px;">Stations Radio</h1>
            <p class="text-secondary" style="font-size: 16px;">Lancez une station basée sur vos genres favoris. La lecture sera aléatoire et infinie.</p>
        </div>

        <div class="card-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 24px;">
    `;

    if (sortedGenres.length === 0) {
         html += '<p class="text-muted">Aucun genre trouvé.</p>';
    } else {
        // Show top 20 genres max
        sortedGenres.slice(0, 20).forEach((g, i) => {
            const count = genres[g].length;
            if (count < 2) return; // Skip genres with only 1 track
            
            // Generate a random gradient based on genre name string
            const hue = (g.charCodeAt(0) * 12 + g.charCodeAt(g.length-1) * 7) % 360;
            const grad = `linear-gradient(135deg, hsl(${hue}, 70%, 30%), hsl(${(hue + 40)%360}, 60%, 15%))`;

            html += `
                <div class="glass-card radio-card" data-genre="${g}" style="padding: 32px 24px; text-align: center; border-radius: var(--radius-lg); background: ${grad}; cursor: pointer;">
                    <span class="material-symbols-rounded" style="font-size: 48px; margin-bottom: 16px; opacity: 0.8;">radio</span>
                    <h3 style="font-size: 24px; font-weight: 700; margin-bottom: 8px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${g}</h3>
                    <p style="font-size: 14px; opacity: 0.7;">${count} titres</p>
                </div>
            `;
        });
    }

    html += '</div>';
    container.innerHTML = html;

    // Bind Radio Play
    container.querySelectorAll('.radio-card').forEach(card => {
        card.addEventListener('click', () => {
            const genre = card.dataset.genre;
            let tracksToPlay = [...genres[genre]];
            
            // Fisher-Yates Shuffle
            for (let i = tracksToPlay.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tracksToPlay[i], tracksToPlay[j]] = [tracksToPlay[j], tracksToPlay[i]];
            }

            // In a real 24/7 radio, the queue would infinite-loop or restock, 
            // but for now we shuffle the whole genre into the player queue
            Player.playTrack(tracksToPlay[0], tracksToPlay, 0);

            // Toast/Visual feedback (simplified)
            card.style.transform = 'scale(0.95)';
            setTimeout(() => card.style.transform = '', 150);
        });
    });
}
