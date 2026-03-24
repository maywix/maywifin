import { Player } from './player.js';

let currentCoverUrl = '/assets/default-cover.png';
const backdrop = document.getElementById('app-backdrop');

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

export function updateProgress(current, total) {
    document.getElementById('time-current').textContent = formatTime(current);
    document.getElementById('time-total').textContent = formatTime(total);
    document.getElementById('seek-bar').value = (current / total) * 100;
}

export function resetPlayerUI() {
    document.getElementById('player-title').textContent = "Aucun titre en lecture";
    document.getElementById('player-artist').textContent = "...";
    document.getElementById('player-cover').src = '/assets/default-cover.png';
    updateProgress(0, 0);
    document.getElementById('play-icon').textContent = 'play_arrow';
    backdrop.style.backgroundImage = 'none';
}

function updateBackdropAndAccentColor(imgElement) {
    // Only works if ColorThief is loaded and img is actually loaded
    if (window.ColorThief) {
        if (imgElement.complete) {
            extractColor();
        } else {
            imgElement.addEventListener('load', extractColor, { once: true });
        }
    }

    function extractColor() {
        try {
            const colorThief = new ColorThief();
            const color = colorThief.getColor(imgElement);
            // Example: set root CSS variable for accent color to match cover
            const rgb = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            // Only update dynamically if settings allow it, for now we just do standard blur
        } catch (e) {
            console.log("Color extraction skipped (CORS or other issue)");
        }
    }
}

export function updatePlayerUI(track, isPlaying) {
    if (track) {
        document.getElementById('player-title').textContent = track.title;
        
        // Add Artist Link
        const artistEl = document.getElementById('player-artist');
        artistEl.innerHTML = `<a href="#/artist/${encodeURIComponent(track.artist)}" style="color: inherit; text-decoration: none;" class="hover-underline">${track.artist}</a>`;
        
        let coverUrl = '/assets/default-cover.png';
        if (track.type === 'local') {
            coverUrl = `/api/library/cover/${track.id}`;
        } else if (track.type === 'jellyfin') {
            coverUrl = `/api/jellyfin/cover/${track.albumId || track.id}`;
        }
        
        if (coverUrl !== currentCoverUrl) {
            currentCoverUrl = coverUrl;
            const imgEl = document.getElementById('player-cover');
            imgEl.src = currentCoverUrl;
            
            // Set Blur Backdrop
            backdrop.style.backgroundImage = `url('${currentCoverUrl}')`;
            updateBackdropAndAccentColor(imgEl);
        }
    }
    
    document.getElementById('play-icon').textContent = isPlaying ? 'pause' : 'play_arrow';
}

// Bind UI Events
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-play-pause').addEventListener('click', () => Player.togglePlay());
    document.getElementById('btn-next').addEventListener('click', () => Player.playNext());
    document.getElementById('btn-prev').addEventListener('click', () => Player.playPrev());
    
    const seekBar = document.getElementById('seek-bar');
    seekBar.addEventListener('input', (e) => Player.seek(e.target.value));

    // Rate / Speed Logic
    const rateBar = document.getElementById('rate-bar');
    const speedDisplay = document.getElementById('speed-display');
    rateBar.addEventListener('input', (e) => {
        const rate = parseFloat(e.target.value);
        speedDisplay.textContent = `${rate.toFixed(1)}x`;
        Player.setRate(rate);
    });

    const volBar = document.getElementById('volume-bar');
    volBar.addEventListener('input', (e) => {
        Player.setVolume(e.target.value / 100);
        const icon = document.getElementById('volume-icon');
        if (e.target.value == 0) icon.textContent = 'volume_mute';
        else if (e.target.value < 50) icon.textContent = 'volume_down';
        else icon.textContent = 'volume_up';
    });
});
