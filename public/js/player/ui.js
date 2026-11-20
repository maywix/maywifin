import { Player } from './player.js';
import { Api } from '../api.js';
import { initQualityMenu } from './quality-menu.js';

let currentCoverUrl = '/assets/default-cover.png';
const backdrop = document.getElementById('app-backdrop');
let waveformBars = [];
let waveformTrackId = null;
const waveformCache = new Map(); // trackId -> peaks[], avoids refetching on repeat plays

const WAVEFORM_BAR_COUNT = 100; // matches the backend's fixed bucket count 1:1

function buildWaveformBars() {
    const host = document.getElementById('waveform-hover');
    if (!host) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
        const bar = document.createElement('span');
        bar.className = 'wf-bar';
        frag.appendChild(bar);
    }
    host.appendChild(frag);
    waveformBars = Array.from(host.children);
}

// The hover waveform only ever shows real peak data (see the .waveform-hover comment in
// main.css) - .has-waveform on the seek bar's wrapper is what reveals it.
function setWaveformAvailable(available) {
    document.getElementById('waveform-hover')?.parentElement.classList.toggle('has-waveform', available);
}

function applyWaveformPeaks(peaks) {
    // Nothing worth drawing (malformed, or a silent/undecodable file where every bucket is
    // ~0): keep the plain bar rather than showing a row of identical slivers.
    if (!Array.isArray(peaks) || !peaks.some((peak) => peak > 0.01)) return;

    waveformBars.forEach((bar, i) => {
        const peak = peaks[i] ?? 0;
        // 8%-92% range so even silence is a visible sliver, not a dead flat line.
        bar.style.height = `${8 + peak * 84}%`;
    });
    setWaveformFill(Number(document.getElementById('seek-bar')?.value) || 0);
    setWaveformAvailable(true);
}

// Fetches the real per-track waveform (see routes/library.js's /waveform/:id - actual
// decoded peak amplitudes, not a fake animation) and updates the hover bars with it.
// Only local tracks can be analyzed this way; Jellyfin ones never get a waveform.
export async function loadWaveformForTrack(track) {
    if (!track || track.id === waveformTrackId) return;
    waveformTrackId = track.id;

    setWaveformAvailable(false);
    if (track.type !== 'local') return;

    if (waveformCache.has(track.id)) {
        applyWaveformPeaks(waveformCache.get(track.id));
        return;
    }

    try {
        const { peaks } = await Api.getWaveform(track.id);
        if (waveformTrackId !== track.id) return; // track changed again before this resolved
        waveformCache.set(track.id, peaks);
        applyWaveformPeaks(peaks);
    } catch (err) {
        console.error('Failed to load waveform', err);
    }
}

export function setVolumeIcon(iconId, value) {
    const icon = document.getElementById(iconId);
    if (!icon) return;
    if (value == 0) icon.textContent = 'volume_mute';
    else if (value < 50) icon.textContent = 'volume_down';
    else icon.textContent = 'volume_up';
}

export function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function setWaveformFill(percent) {
    if (!waveformBars.length) return;
    const playedCount = Math.round((percent / 100) * waveformBars.length);
    waveformBars.forEach((bar, i) => bar.classList.toggle('is-played', i < playedCount));
}

// --- Seek bars ------------------------------------------------------------------------
// Two sliders mirror the playback position: the one in the player bar, and the one in the
// now-playing modal (mobile's full-screen player) that's only in the DOM while it's open -
// so everything here looks them up by id when it needs them instead of caching them.
const SEEK_VIEWS = [
    { bar: 'seek-bar', current: 'time-current', total: 'time-total', waveform: true },
    { bar: 'modal-seek-bar', current: 'modal-time-current', total: 'modal-time-total', waveform: false },
];

// Playback within this many seconds of a seek target counts as having arrived there...
const SEEK_SETTLE_SECONDS = 2.5;
// ...and how long to wait for that before giving up (a stalled or failed stream reload).
const SEEK_HOLD_MAX_MS = 5000;

let dragBar = null; // the slider being scrubbed right now - the user owns it until they let go
let scrubPercent = null; // where they've scrubbed to; committed on release (the slider's 'change')
let seekHold = null; // { trackId, percent, until } - see holdSeekPosition()
let lastKnownDuration = 0;
let lastKnownTime = 0;

function liveSeekViews() {
    return SEEK_VIEWS
        .map((v) => ({
            bar: document.getElementById(v.bar),
            current: document.getElementById(v.current),
            total: document.getElementById(v.total),
            waveform: v.waveform,
        }))
        .filter((v) => v.bar && v.current && v.total);
}

function paintSeekView(view, percent, seconds) {
    const p = Math.min(100, Math.max(0, percent));
    view.bar.value = p;
    // The wrapper draws the played fill from this (see .seek-wrap in main.css).
    view.bar.parentElement.style.setProperty('--seek-p', (p / 100).toFixed(4));
    view.current.textContent = formatTime(seconds);

    const spoken = `${formatTime(seconds)} sur ${formatTime(lastKnownDuration)}`;
    if (view.bar.getAttribute('aria-valuetext') !== spoken) view.bar.setAttribute('aria-valuetext', spoken);

    if (view.waveform) setWaveformFill(p);
}

function renderPosition(percent, seconds) {
    for (const view of liveSeekViews()) {
        // Don't fight the user's drag: playback-driven updates would otherwise snap the
        // handle, fill and label back to the old position while they're still seeking.
        if (view.bar !== dragBar) paintSeekView(view, percent, seconds);
    }
}

function renderCurrentPosition() {
    const percent = seekHold
        ? seekHold.percent
        : (lastKnownDuration ? (lastKnownTime / lastKnownDuration) * 100 : 0);
    renderPosition(percent, (percent / 100) * lastKnownDuration);
}

export function updateProgress(current, total) {
    // Duration can be 0/NaN/Infinity before metadata arrives or with no track loaded.
    // Dividing by it used to hand the slider NaN, which it "corrects" by jumping to 50%.
    const duration = Number.isFinite(total) && total > 0 ? total : 0;
    const time = Number.isFinite(current) ? Math.max(0, current) : 0;
    lastKnownDuration = duration;
    lastKnownTime = time;

    for (const view of liveSeekViews()) {
        view.total.textContent = formatTime(duration);
        view.bar.disabled = !duration;
        view.bar.parentElement.classList.toggle('is-disabled', !duration);
    }

    if (seekHold) {
        const arrived = Math.abs(time - (seekHold.percent / 100) * duration) <= SEEK_SETTLE_SECONDS;
        const stale = seekHold.trackId !== (Player.currentTrack?.id ?? null) || Date.now() > seekHold.until;
        if (!arrived && !stale) return; // playback hasn't reached the seek target yet
        seekHold = null;
    }

    renderPosition(duration ? (time / duration) * 100 : 0, time);
}

// Called for every seek, whatever triggered it (drag, click, arrow keys, a lyric line...).
// Moves the handle and clock to the target right away and keeps them there until playback
// actually gets there. On a transcoded stream a seek is a debounced stream reload, and the old
// stream keeps ticking from its old position in the meantime - without this the handle
// snapped back to where it was after being released, and only then jumped to the target.
export function holdSeekPosition(percent) {
    seekHold = { trackId: Player.currentTrack?.id ?? null, percent, until: Date.now() + SEEK_HOLD_MAX_MS };
    renderCurrentPosition();
}

// Where a seek that's still in flight is heading, or null. Lets repeated relative seeks
// (arrow keys) build on each other instead of all starting from the not-yet-moved position.
export function getHeldSeekPercent() {
    return seekHold ? seekHold.percent : null;
}

// Time label above the bar for a position along it (0..1), kept inside the bar's ends.
function showSeekTooltip(wrap, fraction) {
    const tip = wrap.querySelector('.seek-tooltip');
    if (!tip || !lastKnownDuration) return;
    tip.textContent = formatTime(fraction * lastKnownDuration);
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(wrap.clientWidth - half, Math.max(half, fraction * wrap.clientWidth))}px`;
}

// Wires up a seek slider (the player bar's, or the modal's once it's in the DOM). Scrubbing
// only previews - the handle, clock and tooltip follow the pointer - and the seek itself is
// committed once, on release. Seeking on every 'input' hammered the stream with a seek per
// pixel (and, on a transcoded track, restarted ffmpeg for each one).
export function bindSeekBar(bar) {
    const view = liveSeekViews().find((v) => v.bar === bar);
    if (!view) return;
    const wrap = bar.parentElement;

    const endDrag = () => {
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', cancelDrag);
        if (dragBar === bar) dragBar = null;
        wrap.classList.remove('is-dragging');
    };
    // The browser can take a touch gesture over (pointercancel) without ever firing 'change':
    // drop the half-finished scrub and show where playback really is, rather than leaving
    // the bar stuck on it.
    const cancelDrag = () => {
        endDrag();
        scrubPercent = null;
        renderCurrentPosition();
    };

    // Listens on window, not the slider: the pointer is often released somewhere else, and
    // ending the drag only when the slider itself hears about it left the bar frozen.
    bar.addEventListener('pointerdown', () => {
        dragBar = bar;
        scrubPercent = null;
        wrap.classList.add('is-dragging');
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', cancelDrag);
    });

    bar.addEventListener('input', () => {
        scrubPercent = Number(bar.value);
        paintSeekView(view, scrubPercent, (scrubPercent / 100) * lastKnownDuration);
        showSeekTooltip(wrap, scrubPercent / 100);
    });

    // Fires on release, on a click, and for each keyboard step - the one place a seek happens.
    // Uses the value from the last 'input' rather than reading the slider again, which a
    // playback tick could have overwritten in between.
    bar.addEventListener('change', () => {
        const percent = scrubPercent ?? Number(bar.value);
        scrubPercent = null;
        Player.seek(percent);
    });

    wrap.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' || dragBar === bar) return;
        const rect = wrap.getBoundingClientRect();
        showSeekTooltip(wrap, Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
    });
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
        loadWaveformForTrack(track);

        // Add Artist Link
        const artistEl = document.getElementById('player-artist');
        const sourceQuery = track.type === 'jellyfin' ? '?source=jellyfin' : '?source=local';
        artistEl.innerHTML = `<a href="#/artist/${encodeURIComponent(track.artist)}${sourceQuery}" style="color: inherit; text-decoration: none;" class="hover-underline">${track.artist}</a>`;

        let coverUrl = '/assets/default-cover.png';
        if (track.type === 'local') {
            coverUrl = Api.withAuth(`/api/library/cover/${track.id}`);
        } else if (track.type === 'jellyfin') {
            coverUrl = Api.withAuth(`/api/jellyfin/cover/${track.albumId || track.id}`);
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
    buildWaveformBars();

    document.getElementById('btn-play-pause').addEventListener('click', () => Player.togglePlay());
    document.getElementById('btn-next').addEventListener('click', () => Player.playNext());
    document.getElementById('btn-prev').addEventListener('click', () => Player.playPrev());

    bindSeekBar(document.getElementById('seek-bar'));

    const volBar = document.getElementById('volume-bar');
    volBar.addEventListener('input', (e) => {
        Player.setVolume(e.target.value / 100);
        setVolumeIcon('volume-icon', e.target.value);

        // Keep the modal's volume slider in sync when it's open.
        const modalVolBar = document.getElementById('modal-volume-bar');
        if (modalVolBar) {
            modalVolBar.value = e.target.value;
            setVolumeIcon('modal-volume-icon', e.target.value);
        }
    });

    initQualityMenu((tier) => Player.changeQuality(tier));
});
