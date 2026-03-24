import { Player } from '../player/player.js';

export function showNowPlayingModal(track) {
    if (!track) return;

    // Get cover URL
    let coverUrl = track.id.startsWith('local_') 
        ? `/api/library/cover/${track.id}` 
        : `/api/jellyfin/cover/${track.id}`;

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'now-playing-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
        animation: fadeIn 0.3s ease;
    `;

    // Calculate duration
    const m = Math.floor((track.duration || 0) / 60);
    const s = Math.floor((track.duration || 0) % 60).toString().padStart(2, '0');

    const content = document.createElement('div');
    content.style.cssText = `
        width: 90%;
        max-width: 600px;
        background: var(--bg-elevated);
        border-radius: var(--radius-lg);
        padding: 32px;
        text-align: center;
        animation: slideUp 0.3s ease;
    `;

    content.innerHTML = `
        <button id="close-modal" style="position: absolute; top: 16px; right: 16px; background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 28px;">✕</button>
        
        <img src="${coverUrl}" alt="Album art" style="width: 280px; height: 280px; border-radius: var(--radius-md); object-fit: cover; margin: 0 auto 32px; box-shadow: 0 16px 32px rgba(0,0,0,0.5);">
        
        <h1 style="font-size: 28px; margin-bottom: 8px; font-weight: 700;">${track.title}</h1>
        <p style="font-size: 18px; color: var(--text-secondary); margin-bottom: 24px;">${track.artist}</p>
        ${track.album ? `<p style="font-size: 14px; color: var(--text-muted); margin-bottom: 24px;">Album: ${track.album}</p>` : ''}
        
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 32px;">Durée: ${m}:${s}</p>
        
        <div id="player-modal-controls" style="display: flex; gap: 16px; justify-content: center; align-items: center;">
            <button id="modal-prev" style="width: 48px; height: 48px; border: 1px solid var(--text-secondary); background: transparent; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-primary); transition: all 0.2s;">
                <span class="material-symbols-rounded" style="font-size: 24px;">skip_previous</span>
            </button>
            <button id="modal-play-pause" style="width: 64px; height: 64px; background: var(--accent); border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--bg-base); transition: transform 0.2s;">
                <span class="material-symbols-rounded" style="font-size: 32px;">play_arrow</span>
            </button>
            <button id="modal-next" style="width: 48px; height: 48px; border: 1px solid var(--text-secondary); background: transparent; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-primary); transition: all 0.2s;">
                <span class="material-symbols-rounded" style="font-size: 24px;">skip_next</span>
            </button>
        </div>
    `;

    modal.appendChild(content);

    // Close modal
    const closeBtn = modal.querySelector('#close-modal');
    closeBtn.addEventListener('click', () => modal.remove());
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Player controls
    const playPauseBtn = modal.querySelector('#modal-play-pause');
    const updatePlayPauseIcon = () => {
        const isPlaying = Player.isPlaying();
        playPauseBtn.innerHTML = isPlaying 
            ? '<span class="material-symbols-rounded" style="font-size: 32px;">pause</span>'
            : '<span class="material-symbols-rounded" style="font-size: 32px;">play_arrow</span>';
    };

    updatePlayPauseIcon();
    Player.on('play', updatePlayPauseIcon);
    Player.on('pause', updatePlayPauseIcon);

    playPauseBtn.addEventListener('click', () => {
        if (Player.isPlaying()) {
            Player.pause();
        } else {
            Player.play();
        }
    });

    modal.querySelector('#modal-prev').addEventListener('click', () => {
        Player.previous();
    });

    modal.querySelector('#modal-next').addEventListener('click', () => {
        Player.next();
    });

    // Add styles for animations
    if (!document.querySelector('#modal-styles')) {
        const style = document.createElement('style');
        style.id = 'modal-styles';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(modal);
}
