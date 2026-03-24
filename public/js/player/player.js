import { initAudioContext, AudioEffects } from './effects.js';
import { updatePlayerUI, resetPlayerUI, updateProgress } from './ui.js';
import { loadLyrics, syncLyrics } from './lyrics.js';
import { Api, AppState } from '../api.js';

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.audioElement = new Audio();
        this.audioElement.crossOrigin = "anonymous";
        this.mediaSourceNode = null;
        this.gainNode = null;
        
        this.queue = [];
        this.currentIndex = -1;
        this.isPlayingState = false;
        this.currentTrack = null;
        this.events = {};
        
        // Setup events
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

    // Event system
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    emit(event) {
        if (this.events[event]) {
            this.events[event].forEach(callback => callback());
        }
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

        // Connect: Media -> Gain -> Effects -> Destination
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

        const quality = document.getElementById('stream-quality').value || 'lossless';
        this.audioElement.src = `/api/stream/${track.id}?bitrate=${quality}`;
        
        // Apply Settings (Volume, Reverb, Pitch)
        this.setVolume(document.getElementById('volume-bar').value / 100);
        
        // Apply pitch/slowed effect from settings if enabled
        const isSlowed = AppState.settings.effect_slowed === 'true';
        AudioEffects.setPlaybackRate(this.mediaSourceNode, this.audioElement, isSlowed ? 0.85 : 1.0);
        
        // Apply reverb
        const reverbAmount = parseFloat(AppState.settings.effect_reverb) || 0;
        AudioEffects.setReverb(reverbAmount);

        try {
            await this.audioElement.play();
            updatePlayerUI(track, true);
            Api.recordPlay(track); // Record playcount silently
            Api.recordPlayback(track.id).catch(err => console.error("Failed to record playback", err));
            loadLyrics(track); // Fetch and setup lyrics
        } catch (err) {
            console.error("Playback failed:", err);
            // Handle autoplay policies or network errors
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
            this.currentIndex++;
            this.playTrack(this.queue[this.currentIndex]);
        } else {
            // End of queue
            this.audioElement.src = '';
            resetPlayerUI();
            this.isPlayingState = false;
        }
    }

    playPrev() {
        if (this.audioElement.currentTime > 3) {
            this.audioElement.currentTime = 0; // restart current
        } else if (this.currentIndex > 0) {
            this.currentIndex--;
            this.playTrack(this.queue[this.currentIndex]);
        }
    }

    // Public next/previous methods
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
        if (this.gainNode) {
            // Web Audio API gain for volume control enables linear/exponential curves easily.
            // Simplified linear here for prototype.
            this.gainNode.gain.value = val;
        }
    }

    setRate(rate) {
        if (this.audioElement) {
            this.audioElement.playbackRate = rate;
            this.audioElement.preservesPitch = false; // "Slowed" effect
        }
    }

    onTimeUpdate() {
        if (!this.audioElement.duration || isNaN(this.audioElement.duration)) return;
        updateProgress(this.audioElement.currentTime, this.audioElement.duration);
        syncLyrics(this.audioElement.currentTime);
    }
}

export const Player = new AudioEngine();
