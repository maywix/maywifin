import { initAudioContext, AudioEffects } from './effects.js';
import { updatePlayerUI, resetPlayerUI, updateProgress, holdSeekPosition, getHeldSeekPercent } from './ui.js';
import { loadLyrics, syncLyrics } from './lyrics.js';
import { Api, AppState } from '../api.js';
import { sessionFxState } from './fx-session-state.js';
import { getCurrentQuality, updateQualityMenu } from './quality-menu.js';

const SEEK_DEBOUNCE_MS = 400;
const STATE_STORAGE_KEY = 'maywifin_playback_state';
const STATE_SAVE_INTERVAL_MS = 5000;

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.audioElement = new Audio();
        // crossOrigin is set per-track in playTrack(), not here - see the comment there.
        this.mediaSourceNode = null;
        this.gainNode = null;

        this.queue = [];
        this.currentIndex = -1;
        this.isPlayingState = false;
        this.currentTrack = null;
        this.events = {};

        this.currentStreamMode = 'passthrough'; // 'passthrough' | 'transcode' - drives seek strategy
        this._seekDebounceTimer = null;
        this._lastSeekPercent = 0;
        this._saveStateInterval = null;
        // When a transcoded stream is (re)started at seekTime, ffmpeg's output is a brand
        // new stream whose own currentTime starts back at 0 - this offset is added back on
        // for display so the progress bar reflects the real position in the track instead
        // of restarting from 0% (and looking like playback "jumped back to the start").
        this.streamTimeOffset = 0;

        this.audioElement.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.audioElement.addEventListener('ended', () => this.playNext());
        this.audioElement.addEventListener('play', () => {
            this.isPlayingState = true;
            updatePlayerUI(null, true);
            this.emit('play');
            // Only need to persist position while it's actually moving - saveState() also
            // runs on pause and right before unload, so this is just the "still playing,
            // tab never closed cleanly" safety net.
            this._saveStateInterval = setInterval(() => this.saveState(), STATE_SAVE_INTERVAL_MS);
        });
        this.audioElement.addEventListener('pause', () => {
            this.isPlayingState = false;
            updatePlayerUI(null, false);
            this.emit('pause');
            clearInterval(this._saveStateInterval);
            this.saveState();
        });
    }

    on(event, callback) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(callback);
    }

    emit(event) {
        if (!this.events[event]) return;
        this.events[event].forEach((callback) => callback());
    }

    isPlaying() {
        return this.isPlayingState;
    }

    init() {
        if (this.ctx) {
            console.log('[Player] init() skipped, already connected. ctx.state:', this.ctx.state);
            return;
        }
        console.log('[Player] init() - connecting audio element to Web Audio graph');

        this.ctx = initAudioContext();
        AudioEffects.setup(this.ctx);

        // Hand volume control over to the gain node from here on - reset the element's
        // native volume to full first so it doesn't double up with (or fight) the gain node.
        const currentVolume = this.audioElement.volume;
        this.audioElement.volume = 1;

        this.mediaSourceNode = this.ctx.createMediaElementSource(this.audioElement);
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = currentVolume;

        this.mediaSourceNode.connect(this.gainNode);
        this.gainNode.connect(AudioEffects.inGain);
    }

    // Resolves the rate/reverb to apply: a session FX override (from the popup) wins
    // over the global default settings, so switching tracks never stomps a live adjustment.
    applyFxForCurrentTrack() {
        const rate = sessionFxState.rateOverridden
            ? sessionFxState.rate
            : (AppState.settings.effect_slowed === 'true' ? 0.85 : 1.0);
        this.setRate(rate); // native playbackRate - never needs Web Audio

        const reverbWet = sessionFxState.reverbOverridden
            ? sessionFxState.reverbWet
            : (parseFloat(AppState.settings.effect_reverb) || 0);

        // Only connect to Web Audio (via init()) when reverb is actually wanted. Routing
        // audio through createMediaElementSource is a one-way trip for this element's whole
        // lifetime, and multichannel/Atmos passthrough audio (see resolveStreamPlan's Safari
        // path) loses its surround channels going through that graph in practice - so tracks
        // never pay that cost unless reverb is genuinely in use.
        if (reverbWet > 0) {
            this.init();
            AudioEffects.setReverb(reverbWet);
            AudioEffects.setReverbShape({ decay: sessionFxState.reverbDecay, roomSize: sessionFxState.reverbRoomSize });
        } else if (this.ctx) {
            AudioEffects.setReverb(0);
        }
    }

    async playTrack(track, queueList = null, index = 0, opts = {}) {
        this.currentTrack = track;

        if (queueList) {
            this.queue = queueList;
            this.currentIndex = index;
        }

        const wasPlaying = this.isPlayingState;
        const quality = getCurrentQuality();
        const isReload = opts.seekTime !== undefined;

        // Ask the backend what this track can actually be served at, so the
        // quality menu reflects real source limits (never fabricate quality).
        try {
            const tiersInfo = await Api.getStreamTiers(track.id, quality);
            updateQualityMenu(tiersInfo);
            this.currentStreamMode = tiersInfo?.requestedTierPlan?.mode || 'passthrough';
        } catch (err) {
            this.currentStreamMode = 'passthrough';
        }

        // See the streamTimeOffset field comment: only a transcoded reload needs the
        // offset, since ffmpeg's new output stream restarts its own currentTime at 0.
        this.streamTimeOffset = (isReload && this.currentStreamMode === 'transcode') ? opts.seekTime : 0;

        // Local streams are same-origin (served by MayWiFin itself) so crossOrigin is a
        // no-op either way there. Jellyfin tracks are proxied via a redirect to an external
        // server we don't control the CORS headers of - forcing crossOrigin="anonymous" on
        // those made the browser reject the whole stream if Jellyfin's response (especially
        // after transcoding formats like ALAC/EAC3 m4a) didn't carry the right CORS headers,
        // which is exactly what broke Jellyfin m4a playback. Must be set before .src loads.
        this.audioElement.crossOrigin = track.type === 'jellyfin' ? null : 'anonymous';

        let src = `/api/stream/${track.id}?tier=${quality}`;
        if (isReload) src += `&seekTime=${opts.seekTime}`;
        this.audioElement.src = Api.withAuth(src);

        // A fresh track starts from a clean bar. Without this the previous track's progress
        // stays on screen until the new stream's first 'timeupdate' - a while, for a slow
        // Jellyfin/transcoded start. A reload (seek / quality change) is the same track: leave it.
        if (!isReload) updateProgress(0, track.duration || 0);

        this.setVolume((document.getElementById('volume-bar')?.value || 100) / 100);
        this.applyFxForCurrentTrack();

        try {
            if (isReload) {
                // Resuming a seek (or quality change) on a transcoded stream: ffmpeg was
                // restarted at the target time, so the new stream itself starts at t=0 -
                // only restore playback state, don't re-count a play or reload lyrics.
                if (wasPlaying) await this.audioElement.play();
                updatePlayerUI(track, wasPlaying);
                return;
            }

            await this.audioElement.play();
            updatePlayerUI(track, true);
            Api.recordPlay(track).catch(() => {});
            if (Api.recordPlayback) Api.recordPlayback(track.id).catch(() => {});
            loadLyrics(track);
            this.saveState();
        } catch (err) {
            console.error('Playback failed:', err);
        }
    }

    // Reload the current track at a different quality tier, preserving playback
    // position and play/pause state - called from the quality menu on selection.
    changeQuality(tier) {
        if (!this.currentTrack) return;
        // Must include streamTimeOffset: if the current stream is itself a transcode that
        // was already resumed from a seek, audioElement.currentTime alone is only the
        // position *within that reload*, not the true position in the track - using it
        // bare here would silently rewind on every quality change.
        const currentTime = this.streamTimeOffset + (this.audioElement.currentTime || 0);
        this.playTrack(this.currentTrack, null, this.currentIndex, { seekTime: currentTime });
    }

    togglePlay() {
        if (!this.audioElement.src) return;

        if (this.isPlayingState) {
            this.audioElement.pause();
        } else {
            this.audioElement.play();
        }
    }

    playNext() {
        if (this.currentIndex < this.queue.length - 1) {
            this.currentIndex += 1;
            this.playTrack(this.queue[this.currentIndex]);
            return;
        }

        this.audioElement.src = '';
        resetPlayerUI();
        this.isPlayingState = false;
        this.clearState();
    }

    playPrev() {
        if (this.audioElement.currentTime > 3) {
            this.audioElement.currentTime = 0;
            return;
        }

        if (this.currentIndex > 0) {
            this.currentIndex -= 1;
            this.playTrack(this.queue[this.currentIndex]);
        }
    }

    next() {
        this.playNext();
    }

    previous() {
        this.playPrev();
    }

    play() {
        this.audioElement.play();
    }

    pause() {
        this.audioElement.pause();
    }

    // Real byte-range seeking only works for passthrough streams. A transcoded stream
    // (ffmpeg piped live) has no fixed byte->time mapping, so seeking there means
    // restarting the transcode with -ss at the target time - debounced so dragging the
    // seek bar doesn't spawn an ffmpeg process per pixel of movement.
    seek(percent) {
        this._lastSeekPercent = percent;
        holdSeekPosition(percent);

        if (this.currentStreamMode !== 'transcode') {
            if (!this.audioElement.duration || isNaN(this.audioElement.duration)) {
                // Duration isn't known yet - e.g. right after loading/restoring a track,
                // before metadata has arrived. Apply this seek as soon as it is, instead
                // of silently dropping it (which looked like the seek bar "does nothing").
                this.audioElement.addEventListener('loadedmetadata', () => {
                    this.audioElement.currentTime = (this._lastSeekPercent / 100) * this.audioElement.duration;
                }, { once: true });
                return;
            }
            this.audioElement.currentTime = (percent / 100) * this.audioElement.duration;
            return;
        }

        clearTimeout(this._seekDebounceTimer);
        this._seekDebounceTimer = setTimeout(() => {
            const totalDuration = this.currentTrack?.duration
                || (isFinite(this.audioElement.duration) ? this.audioElement.duration : 0);
            if (!totalDuration || !this.currentTrack) return;

            const seekTime = Math.max(0, (this._lastSeekPercent / 100) * totalDuration);
            this.playTrack(this.currentTrack, null, this.currentIndex, { seekTime });
        }, SEEK_DEBOUNCE_MS);
    }

    // Seeks to an absolute time in the track - used by clickable lyric lines (seek()
    // itself is percent-based, which is what the drag bar deals in).
    seekToTime(seconds) {
        const duration = this.getDuration();
        if (!duration) return;
        this.seek((seconds / duration) * 100);
    }

    // Relative seek (e.g. keyboard shortcuts) - resolves the true current position first
    // (accounting for streamTimeOffset, same as changeQuality) so it works correctly
    // whether or not the current stream is a passthrough or a transcoded reload.
    seekBy(deltaSeconds) {
        if (!this.currentTrack) return;
        const duration = this.currentTrack.duration
            || (isFinite(this.audioElement.duration) ? this.audioElement.duration : 0);
        if (!duration) return;

        // If an earlier seek hasn't landed yet (a transcoded stream takes a moment to reload),
        // start from where it's heading - otherwise a burst of arrow presses would each be
        // measured from the same old position and collapse into a single 5s step.
        const heldPercent = getHeldSeekPercent();
        const currentTime = heldPercent !== null
            ? (heldPercent / 100) * duration
            : this.streamTimeOffset + (this.audioElement.currentTime || 0);
        const targetTime = Math.max(0, Math.min(duration, currentTime + deltaSeconds));
        this.seek((targetTime / duration) * 100);
    }

    setVolume(val) {
        // Native volume when Web Audio isn't connected (the common case now - see
        // applyFxForCurrentTrack), the gain node once it is (reverb engaged).
        if (this.gainNode) {
            this.gainNode.gain.value = val;
        } else {
            this.audioElement.volume = val;
        }
    }

    setRate(rate) {
        this.audioElement.playbackRate = rate;
        this.audioElement.preservesPitch = false;
    }

    // Transcoded streams (Atmos/multichannel downmix, format-compat re-encodes) are sent
    // without a Content-Length, so the browser can't determine a real .duration
    // (Infinity/NaN) - fall back to the track's known metadata duration.
    getDuration() {
        return this.currentStreamMode === 'transcode'
            ? (this.currentTrack?.duration || 0)
            : (isFinite(this.audioElement.duration) && this.audioElement.duration > 0
                ? this.audioElement.duration
                : (this.currentTrack?.duration || 0));
    }

    // After a seek on a transcoded stream, ffmpeg's new output restarts its own
    // currentTime at 0, so streamTimeOffset (the position it was restarted at) has to be
    // added back in - otherwise this would visibly reset to 0 on every seek instead of
    // reporting the real position in the track.
    getCurrentTime() {
        return this.streamTimeOffset + (this.audioElement.currentTime || 0);
    }

    onTimeUpdate() {
        const duration = this.getDuration();
        if (!duration) return;

        const currentTime = this.getCurrentTime();
        updateProgress(currentTime, duration);
        syncLyrics(currentTime);
    }

    // Persists just enough to reload the current track and jump back to where playback
    // was - not the whole queue (prev/next after a resume just replays this one track),
    // that's not what a page reload needs to feel less jarring.
    saveState() {
        if (!this.currentTrack) return;
        const { id, title, artist, album, duration, type, albumId } = this.currentTrack;
        const state = {
            track: { id, title, artist, album, duration, type, albumId },
            currentTime: this.getCurrentTime(),
        };
        try {
            localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
        } catch (err) {
            // Storage full or unavailable (private browsing) - resuming just won't work.
        }
    }

    clearState() {
        try {
            localStorage.removeItem(STATE_STORAGE_KEY);
        } catch (err) {
            // Nothing to clean up if storage isn't available in the first place.
        }
    }

    // Called once on app init. Loads the track and seeks to the saved position, but never
    // autoplays (browsers block unrequested audio anyway, and popping in with sound on
    // every reload would be its own kind of annoying) and doesn't count a play.
    restoreState() {
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(STATE_STORAGE_KEY));
        } catch (err) {
            return;
        }
        if (!saved?.track?.id || typeof saved.currentTime !== 'number') return;

        this._restoreTrack(saved.track, saved.currentTime);
    }

    async _restoreTrack(track, currentTime) {
        // Goes through the same isReload path playTrack uses for a quality change: sets
        // up the stream (with seekTime baked into the URL for a transcoded track), updates
        // the UI, but - since isPlayingState is still false at this point - never plays.
        await this.playTrack(track, [track], 0, { seekTime: currentTime });
        loadLyrics(track); // isReload skips this (see playTrack) - a fresh session wants it.

        // Reflect the resumed position right away - nothing fires 'timeupdate' until the
        // user actually presses play, so without this the bar would sit at 0:00 until then.
        updateProgress(currentTime, track.duration || 0);

        // Passthrough seeking is client-side (see seek()) and needs metadata loaded first;
        // a transcoded stream already got seekTime baked into its URL by playTrack above.
        if (this.currentStreamMode !== 'transcode') {
            const seekOnceLoaded = () => {
                this.audioElement.currentTime = currentTime;
                this.audioElement.removeEventListener('loadedmetadata', seekOnceLoaded);
            };
            this.audioElement.addEventListener('loadedmetadata', seekOnceLoaded);
        }
    }
}

export const Player = new AudioEngine();

// Catches the case the periodic/pause-driven saves can miss: a reload or tab close
// firing mid-playback, between two saves.
window.addEventListener('beforeunload', () => Player.saveState());
