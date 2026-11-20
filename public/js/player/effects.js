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
        console.log('[AudioEffects] setup() - ctx.state:', ctx.state, 'sampleRate:', ctx.sampleRate);

        this.ctx = ctx;
        this.reverbDecay = 3;
        this.reverbRoomSize = 3;
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
        if (!this.wetGain) {
            console.warn('[AudioEffects] setReverb called but wetGain not set up yet (amount=', amount, ')');
            return;
        }
        // Was capped at 0.5 wet / -30% dry, which is barely audible at low-to-mid slider
        // values on typical music (as opposed to a quiet test tone) - full range now.
        this.wetGain.gain.value = amount;
        this.dryGain.gain.value = 1 - (amount * 0.6);
        console.log('[AudioEffects] setReverb amount=', amount, 'wetGain=', this.wetGain.gain.value, 'dryGain=', this.dryGain.gain.value, 'ctx.state=', this.ctx?.state);
    },

    // decay: 0.5-6 (how fast the tail fades), roomSize: 0.5-6 (perceived space, in seconds of IR length)
    setReverbShape({ decay, roomSize }) {
        if (!this.ctx || !this.reverbNode) return;
        this.reverbDecay = decay ?? this.reverbDecay;
        this.reverbRoomSize = roomSize ?? this.reverbRoomSize;
        this.reverbNode.buffer = this.generateImpulseResponse(this.ctx, this.reverbRoomSize, this.reverbDecay);
    }
};
