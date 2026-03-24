import { Api } from '../api.js';

let parsedLyrics = []; // Array of { time: num, text: "string" }
let currentLyricIndex = -1;
let lyricsContainer = null;

export async function loadLyrics(track) {
    if (!lyricsContainer) lyricsContainer = document.getElementById('panel-content');
    lyricsContainer.innerHTML = '<div class="lyrics-loading">Recherche des paroles...</div>';
    parsedLyrics = [];
    currentLyricIndex = -1;

    try {
        const data = await Api.getLyrics(track.title, track.artist, track.album, track.duration);
        
        if (data && data.syncedLyrics) {
            parsedLyrics = parseLRC(data.syncedLyrics);
            renderLyrics();
        } else if (data && data.plainLyrics) {
            lyricsContainer.innerHTML = `<div class="plain-lyrics">${data.plainLyrics.replace(/\\n/g, '<br>')}</div>`;
        } else {
            lyricsContainer.innerHTML = '<div class="no-lyrics">Aucune parole trouvée.</div>';
        }
    } catch (err) {
        lyricsContainer.innerHTML = '<div class="no-lyrics">Erreur de chargement des paroles.</div>';
    }
}

function parseLRC(lrcText) {
    const lines = lrcText.split('\\n');
    const lyrics = [];
    const timeReg = /\\[(\\d{2}):(\\d{2})\\.(\\d{2,3})\\]/;

    lines.forEach(line => {
        const match = timeReg.exec(line);
        if (match) {
            const min = parseInt(match[1], 10);
            const sec = parseInt(match[2], 10);
            const ms = parseInt(match[3], 10) * (match[3].length === 2 ? 10 : 1);
            const time = min * 60 + sec + ms / 1000;
            const text = line.replace(timeReg, '').trim();
            if (text) {
                lyrics.push({ time, text });
            }
        }
    });
    return lyrics;
}

function renderLyrics() {
    let html = '';
    parsedLyrics.forEach((line, i) => {
        html += `<p id="lyric-${i}" class="lyric-line">${line.text}</p>`;
    });
    lyricsContainer.innerHTML = html;
}

export function syncLyrics(currentTime) {
    if (parsedLyrics.length === 0) return;

    // Find current line
    let activeIndex = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
        if (currentTime >= parsedLyrics[i].time) {
            activeIndex = i;
        } else {
            break;
        }
    }

    if (activeIndex !== currentLyricIndex && activeIndex !== -1) {
        // Remove previous active state
        if (currentLyricIndex !== -1) {
            const prevEl = document.getElementById(`lyric-${currentLyricIndex}`);
            if (prevEl) prevEl.classList.remove('active');
        }
        
        currentLyricIndex = activeIndex;
        
        // Add new active state and scroll into view
        const activeEl = document.getElementById(`lyric-${activeIndex}`);
        if (activeEl) {
            activeEl.classList.add('active');
            // Smooth scroll to center
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}
