import { Player } from '../player/player.js';
import { Api } from '../api.js';
import { bindSeekBar, updateProgress, setVolumeIcon } from '../player/ui.js';

// The full-screen "now playing" player - opened from the mini player bar's cover art.
// On desktop it's an optional Apple-Music-style overlay; on mobile it's the only place
// the seek bar, volume and lyrics/FX shortcuts live, since the bottom player bar is too
// narrow to hold them (see main.css's mobile breakpoints).
export function showNowPlayingModal(track) {
    if (!track) return;

    let coverUrl = Api.withAuth(track.id.startsWith('local_')
        ? `/api/library/cover/${track.id}`
        : `/api/jellyfin/cover/${track.id}`);

    const modal = document.createElement('div');
    modal.id = 'now-playing-modal';
    modal.className = 'modal-overlay';

    const currentVolume = document.getElementById('volume-bar')?.value ?? 100;

    const content = document.createElement('div');
    content.className = 'modal-card now-playing-modal-card';

    content.innerHTML = `
        <button id="close-modal" class="modal-close"><span class="material-symbols-rounded">close</span></button>

        <img src="${coverUrl}" alt="Album art" class="now-playing-modal-cover">

        <h1 class="now-playing-modal-title">${track.title}</h1>
        <p class="text-secondary now-playing-modal-artist">${track.artist}</p>
        ${track.album ? `<p class="text-muted text-sm now-playing-modal-album">${track.album}</p>` : ''}

        <div class="progress-container now-playing-modal-progress">
            <span id="modal-time-current" class="time">0:00</span>
            <div class="seek-wrap is-disabled">
                <input type="range" id="modal-seek-bar" class="seek-bar" value="0" min="0" max="100" step="any" aria-label="Position de lecture" disabled>
            </div>
            <span id="modal-time-total" class="time">0:00</span>
        </div>

        <div class="modal-transport">
            <button id="modal-prev" class="modal-transport-btn">
                <span class="material-symbols-rounded" style="font-size: 24px;">skip_previous</span>
            </button>
            <button id="modal-play-pause" class="modal-transport-btn modal-play-pause">
                <span class="material-symbols-rounded" style="font-size: 30px;">play_arrow</span>
            </button>
            <button id="modal-next" class="modal-transport-btn">
                <span class="material-symbols-rounded" style="font-size: 24px;">skip_next</span>
            </button>
        </div>

        <div class="modal-secondary-controls">
            <div class="volume-container">
                <span class="material-symbols-rounded" id="modal-volume-icon">volume_up</span>
                <input type="range" id="modal-volume-bar" class="volume-bar" value="${currentVolume}" min="0" max="100">
            </div>
            <button id="modal-btn-lyrics" class="icon-btn" title="Paroles"><span class="material-symbols-rounded">lyrics</span></button>
            <button id="modal-btn-fx" class="icon-btn" title="Effets"><span class="material-symbols-rounded">graphic_eq</span></button>
        </div>
    `;

    modal.appendChild(content);

    modal.querySelector('#close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    const playPauseBtn = modal.querySelector('#modal-play-pause');
    const updatePlayPauseIcon = () => {
        const isPlaying = Player.isPlaying();
        playPauseBtn.innerHTML = isPlaying
            ? '<span class="material-symbols-rounded" style="font-size: 30px;">pause</span>'
            : '<span class="material-symbols-rounded" style="font-size: 30px;">play_arrow</span>';
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

    modal.querySelector('#modal-prev').addEventListener('click', () => Player.previous());
    modal.querySelector('#modal-next').addEventListener('click', () => Player.next());

    // Volume - mirrors, and is mirrored by, the main player bar's volume slider (see ui.js).
    const volBar = modal.querySelector('#modal-volume-bar');
    setVolumeIcon('modal-volume-icon', volBar.value);
    volBar.addEventListener('input', (e) => {
        Player.setVolume(e.target.value / 100);
        setVolumeIcon('modal-volume-icon', e.target.value);
        const mainVolBar = document.getElementById('volume-bar');
        if (mainVolBar) {
            mainVolBar.value = e.target.value;
            setVolumeIcon('volume-icon', e.target.value);
        }
    });

    // Lyrics/FX just trigger the real buttons - avoids duplicating their logic here,
    // and keeps a single source of truth for what "open lyrics" / "open FX" means.
    modal.querySelector('#modal-btn-lyrics').addEventListener('click', () => {
        document.getElementById('btn-lyrics')?.click();
    });
    modal.querySelector('#modal-btn-fx').addEventListener('click', () => {
        document.getElementById('btn-fx')?.click();
    });

    document.body.appendChild(modal);

    // Seek bar - wired and primed with the real current position/duration only now that it's
    // in the DOM (ui.js finds it by id), so it doesn't sit at 0 until the next timeupdate
    // tick (which never fires while paused).
    bindSeekBar(modal.querySelector('#modal-seek-bar'));
    updateProgress(Player.getCurrentTime(), Player.getDuration());
}
