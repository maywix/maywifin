const { execFile } = require('child_process');

const LOSSLESS_CODECS = new Set([
    'flac', 'alac', 'ape', 'wavpack', 'tta',
    'pcm_s16le', 'pcm_s16be', 'pcm_s24le', 'pcm_s24be', 'pcm_s32le', 'pcm_s32be',
    'pcm_f32le', 'pcm_f64le', 'pcm_u8'
]);

function execFileP(file, args) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
            if (err) return reject(err);
            resolve(stdout);
        });
    });
}

function detectAtmos(stream, container) {
    const codec = (stream.codec_name || '').toLowerCase();
    const profile = (stream.profile || '').toLowerCase();
    const layout = (stream.channel_layout || '').toLowerCase();
    const channels = stream.channels || 0;
    const containerStr = (container || '').toLowerCase();
    const tagsBlob = JSON.stringify(stream.tags || {}).toLowerCase();
    const sideData = JSON.stringify(stream.side_data_list || []).toLowerCase();

    const hasJoc = profile.includes('atmos') || profile.includes('joc') || tagsBlob.includes('atmos') || sideData.includes('atmos');

    if (codec === 'eac3' && hasJoc) {
        return { is_atmos: true, atmos_confidence: 'confirmed' };
    }
    if (codec === 'truehd') {
        return { is_atmos: true, atmos_confidence: 'likely' };
    }
    if (codec === 'ac4') {
        return { is_atmos: true, atmos_confidence: 'likely' };
    }
    const objectLayout = /\d+\.\d+\.\d+/.test(layout); // e.g. 5.1.2, 7.1.4
    if (objectLayout && ['eac3', 'truehd', 'ac4', 'ac3'].includes(codec)) {
        return { is_atmos: true, atmos_confidence: 'likely' };
    }
    // ffprobe's basic stream listing doesn't expose E-AC-3's embedded JOC (object audio)
    // flag at all in many builds, so a plain "5.1" layout isn't proof there's no Atmos
    // data in there. In practice, multichannel E-AC-3 inside an .m4a/.mp4 container is
    // the exact signature streaming services (Apple Music in particular) use to deliver
    // Dolby Atmos tracks - flag it as a likely Atmos source rather than silently missing it.
    if (codec === 'eac3' && channels > 2 && /mp4|m4a|mov|3gp/.test(containerStr)) {
        return { is_atmos: true, atmos_confidence: 'likely' };
    }
    return { is_atmos: false, atmos_confidence: null };
}

/**
 * Probe an audio file with ffprobe and return normalized technical metadata.
 * Uses execFile (not exec) so file paths can never be interpreted by a shell.
 */
async function probeFile(filePath) {
    const stdout = await execFileP('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
    ]);

    const data = JSON.parse(stdout);
    const stream = (data.streams || []).find((s) => s.codec_type === 'audio');
    if (!stream) {
        throw new Error('No audio stream found');
    }

    const codec = stream.codec_name || null;
    const container = data.format?.format_name || null;
    const sampleRate = stream.sample_rate ? parseInt(stream.sample_rate, 10) : null;
    const channels = stream.channels || null;
    const channelLayout = stream.channel_layout || null;
    const bitDepth = stream.bits_per_raw_sample
        ? parseInt(stream.bits_per_raw_sample, 10)
        : (stream.bits_per_sample ? parseInt(stream.bits_per_sample, 10) : null);
    const bitrate = stream.bit_rate
        ? parseInt(stream.bit_rate, 10)
        : (data.format?.bit_rate ? parseInt(data.format.bit_rate, 10) : null);

    const isLossless = LOSSLESS_CODECS.has((codec || '').toLowerCase());
    const { is_atmos, atmos_confidence } = detectAtmos(stream, container);

    return {
        codec,
        container,
        sample_rate: sampleRate || null,
        bit_depth: (bitDepth && bitDepth > 0) ? bitDepth : null,
        channels: channels || null,
        channel_layout: channelLayout,
        bitrate: (bitrate && bitrate > 0) ? bitrate : null,
        is_lossless: isLossless ? 1 : 0,
        is_atmos: is_atmos ? 1 : 0,
        atmos_confidence
    };
}

module.exports = { probeFile, LOSSLESS_CODECS };
