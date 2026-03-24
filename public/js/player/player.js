import { initAudioContext, AudioEffects } from './effects.js';
import { updatePlayerUI, resetPlayerUI, updateProgress } from './ui.js';
import { loadLyrics, syncLyrics } from './lyrics.js';
import { Api, AppState } from '../api.js';

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.audioElement = new Audio();
        this.audioElement.crossOrigin = 'anonymous';
        this.mediaSourceNode = null;
        this.gainNode = null;

        this.queue = [];
        this.currentIndex = -1;
        this.isPlayingState = false;
        this.currentTrack = null;
        this.events = {};

        this.audioElement.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.audioElement.addEventListener('ended', () => this.playNext());
        this.audioElement.addEventListener('play', () => {
            this.isPlayingState = true;
            updatePlayerUI(null, true);
            this.emit('play');
        });
        this.audioElement.addEventListener('pause', () => {
            this.isPlayingState = false;
            updatePlayerUI(null, false);
            this.emit('pause');
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
        if (this.ctx) return;

        this.ctx = initAudioContext();
        AudioEffects.setup(this.ctx);

        this.mediaSourceNode = this.ctx.createMediaElementSource(this.audioElement);
        this.gainNode = this.ctx.createGain();

        this.mediaSourceNode.connect(this.gainNode);
        this.gainNode.connect(AudioEffects.inGain);
    }

    async playTrack(track, queueList = null, index = 0) {
        this.init();
        this.currentTrack = track;

        if (queueList) {
            this.queue = queueList;
            this.currentIndex = index;
        }

        const quality = document.getElementById('stream-quality')?.value || 'lossless';
        this.audioElement.src = `/api/stream/${track.id}?bitrate=${quality}`;

        this.setVolume((document.getElementById('volume-bar')?.value || 100) / 100);

        const isSlowed = AppState.settings.effect_slowed === 'true';
        AudioEffects.setPlaybackRate(this.mediaSourceNode, this.audioElement, isSlowed ? 0.85 : 1.0);

        const reverbAmount = parseFloat(AppState.settings.effect_reverb) || 0;
        AudioEffects.setReverb(reverbAmount);

        try {
            await this.audioElement.play();
            updatePlayerUI(track, true);
            Api.recordPlay(track).catch(() => {});
            if (Api.recordPlayback) Api.recordPlayback(track.id).catch(() => {});
            loadLyrics(track);
        } catch (err) {
            console.error('Playback failed:', err);
        }
    }

    togglePlay() {
        if (!this.audioElement.src) return;

        if (this.isPlayingState) {
            this.audioElement.pause();
        } else {
            this.init();
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

    seek(percent) {
        if (!this.audioElement.duration || isNaN(this.audioElement.duration)) return;
        this.audioElement.currentTime = (percent / 100) * this.audioElement.duration;
    }

    setVolume(val) {
        if (!this.gainNode) return;
        this.gainNode.gain.value = val;
    }

    setRate(rate) {
        this.audioElement.playbackRate = rate;
        this.audioElement.preservesPitch = false;
    }

    onTimeUpdate() {
        if (!this.audioElement.duration || isNaN(this.audioElement.duration)) return;
        updateProgress(this.audioElement.currentTime, this.audioElement.duration);
        syncLyrics(this.audioElement.currentTime);
    }
}

export const Player = new AudioEngine();
