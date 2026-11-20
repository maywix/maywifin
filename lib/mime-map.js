// Codec/container -> HTTP Content-Type, for correct browser playback of passthrough streams.
const CODEC_MIME = {
    flac: 'audio/flac',
    alac: 'audio/mp4',
    ape: 'audio/x-ape',
    wavpack: 'audio/x-wavpack',
    tta: 'audio/x-tta',
    mp3: 'audio/mpeg',
    aac: 'audio/aac',
    vorbis: 'audio/ogg',
    opus: 'audio/ogg',
    wmav1: 'audio/x-ms-wma',
    wmav2: 'audio/x-ms-wma',
    wmalossless: 'audio/x-ms-wma',
    pcm_s16le: 'audio/wav',
    pcm_s16be: 'audio/wav',
    pcm_s24le: 'audio/wav',
    pcm_s24be: 'audio/wav',
    pcm_s32le: 'audio/wav',
    pcm_s32be: 'audio/wav',
    pcm_f32le: 'audio/wav',
    pcm_f64le: 'audio/wav',
    pcm_u8: 'audio/wav',
    eac3: 'audio/eac3',
    ac3: 'audio/ac3',
    dts: 'audio/vnd.dts',
    truehd: 'audio/vnd.dolby.mlp',
    ac4: 'audio/ac4'
};

const CONTAINER_MIME = {
    flac: 'audio/flac',
    wav: 'audio/wav',
    aiff: 'audio/aiff',
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg'
};

function mimeForTrack(track) {
    if (!track) return 'application/octet-stream';

    const container = (track.container || '').toLowerCase();
    // container is a comma-separated list from ffprobe, e.g. "mov,mp4,m4a"
    const parts = container.split(',').map((p) => p.trim());

    // A "wrapper" container is what the client actually needs to know to demux the file
    // correctly - the codec inside (AAC, ALAC, E-AC-3, AC-3...) doesn't change the outer
    // format. Checking codec first here was a real bug: an .m4a holding E-AC-3 (a common
    // Dolby Atmos delivery shape) was being labeled "audio/eac3", telling the client to
    // expect a raw E-AC-3 elementary stream instead of the MP4 container it actually is.
    for (const part of parts) {
        if (part === 'mov' || part === 'mp4' || part === 'm4a' || part === '3gp' || part === '3g2' || part === 'mj2') return 'audio/mp4';
        if (part === 'matroska' || part === 'webm') return 'audio/webm';
        if (part === 'ogg') return 'audio/ogg';
    }

    const codec = (track.codec || '').toLowerCase();
    if (CODEC_MIME[codec]) return CODEC_MIME[codec];

    for (const part of parts) {
        if (CONTAINER_MIME[part]) return CONTAINER_MIME[part];
    }

    return 'application/octet-stream';
}

module.exports = { mimeForTrack };
