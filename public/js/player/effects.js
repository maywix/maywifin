let audioCtx;

export function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

export const AudioEffects = {
    pitchNode: null,
    reverbNode: null,
    inGain: null,
    outGain: null,

    // Basic Reverb Impulse Response generator (White noise with exponential decay)
    generateImpulseResponse(ctx, duration = 2, decay = 2) {
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const impulse = ctx.createBuffer(2, length, sampleRate);
        const ls = impulse.getChannelData(0);
        const rs = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = i / length;
            // Generate white noise, apply exponential decay
            const v = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
            ls[i] = v;
            rs[i] = v;
        }
        return impulse;
    },

    setup(ctx) {
        if (this.inGain) return; // already setup

        this.inGain = ctx.createGain();
        this.outGain = ctx.createGain();
        
        // Reverb Node
        this.reverbNode = ctx.createConvolver();
        this.reverbNode.buffer = this.generateImpulseResponse(ctx, 3, 3);
        
        // Dry/Wet Mix for reverb
        this.dryGain = ctx.createGain();
        this.wetGain = ctx.createGain();
        this.wetGain.gain.value = 0; // Off by default
        this.dryGain.gain.value = 1;

        // Routing
        this.inGain.connect(this.dryGain);
        this.inGain.connect(this.reverbNode);
        this.reverbNode.connect(this.wetGain);
        
        this.dryGain.connect(this.outGain);
        this.wetGain.connect(this.outGain);

        this.outGain.connect(ctx.destination);
    },

    setReverb(amount) { // 0 to 1
        if (!this.wetGain) return;
        this.wetGain.gain.value = amount * 0.5; // Scale down a bit so it's not overwhelming
        this.dryGain.gain.value = 1 - (amount * 0.3);
    },

    // For playbackRate pitch shift (Slowed / Sped up) since true pitch shifting in JS is heavy
    setPlaybackRate(mediaElementNode, sourceHtmlAudioElement, rate) {
        if (sourceHtmlAudioElement) {
            // HTML5 audio playbackRate alters pitch natively
            sourceHtmlAudioElement.playbackRate = rate;
            sourceHtmlAudioElement.preservesPitch = false; // Force slowed+reverb effect natively
        }
    }
};
