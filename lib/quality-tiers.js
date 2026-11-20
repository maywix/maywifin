// Central "never transcode up" decision logic, shared by the streaming route
// and the tiers-info endpoint so both use identical rules.

const TIER_ORDER = ['hires', 'lossless', '320', '128'];
const TIER_BITRATE = { hires: null, lossless: null, '320': 320000, '128': 128000 };
const DOWNMIX_FALLBACK_BITRATE = 320000;

// Codecs a mainstream browser (Chrome/Firefox/Edge) can decode natively via <audio>.
// Notably NOT here: alac, ape, wavpack, tta (lossless but Safari-only/unsupported),
// wma, ac3/eac3/dts/truehd/ac4 (need ffmpeg either way). Passing one of those straight
// through produces silence/garbled audio in most browsers even though the byte stream
// itself is fine - hence the dedicated lossless-compat transcode path below.
const NATIVE_PLAYABLE_CODECS = new Set([
    'mp3', 'aac', 'flac', 'vorbis', 'opus',
    'pcm_s16le', 'pcm_s16be', 'pcm_s24le', 'pcm_s24be', 'pcm_s32le', 'pcm_s32be',
    'pcm_f32le', 'pcm_f64le', 'pcm_u8'
]);

// Safari (AVFoundation-backed, on macOS/iOS) decodes a noticeably wider set of codecs
// natively than Chrome/Firefox - notably Apple's own ALAC, and often multichannel/Atmos
// beds via CoreAudio passthrough to compatible hardware/AirPlay. There's no portable way
// to feature-detect this from the server, so it's User-Agent gated (see isSafariUA below).
const SAFARI_EXTRA_NATIVE_CODECS = new Set(['alac']);

function normalizeTier(requestedTier) {
    return TIER_ORDER.includes(requestedTier) ? requestedTier : 'lossless';
}

/**
 * Decide how to serve a track for a requested quality tier.
 * trackMeta: row from the `tracks` table (is_lossless, bitrate, channels, bit_depth, codec...)
 * opts.isSafari: relaxes codec/downmix rules for Safari's wider native decode support.
 * Returns { mode: 'passthrough'|'transcode', targetFormat, targetBitrate, downmix, reason }
 */
function resolveStreamPlan(trackMeta, requestedTier, opts = {}) {
    const { isSafari = false } = opts;
    const tier = normalizeTier(requestedTier);
    const sourceIsLossless = !!trackMeta?.is_lossless;
    const sourceBitrate = trackMeta?.bitrate || 0;
    const channels = trackMeta?.channels || 2;
    const codec = (trackMeta?.codec || '').toLowerCase();
    // Safari can be trusted to attempt a raw multichannel/Atmos stream itself (AVFoundation
    // handles the bed-layer decode, and can pass Atmos through to compatible output) -
    // only force the lossy downmix for browsers that would otherwise get silence.
    const needsDownmix = channels > 2 && !isSafari;
    const nativelyPlayable = NATIVE_PLAYABLE_CODECS.has(codec) || (isSafari && SAFARI_EXTRA_NATIVE_CODECS.has(codec));

    let mode;
    let targetFormat = null;
    let targetBitrate = null;
    let reason = null;

    if (tier === 'hires' || tier === 'lossless') {
        if (!sourceIsLossless) {
            // Never fabricate lossless/hi-res quality from a lossy source - just cap at source.
            mode = 'passthrough';
            reason = 'source-not-lossless';
        } else if (nativelyPlayable) {
            mode = 'passthrough';
        } else {
            // Lossless but the browser can't decode this codec (e.g. ALAC in .m4a) -
            // re-encode to FLAC so it actually plays, with zero quality loss.
            mode = 'transcode';
            targetFormat = 'flac';
            reason = 'codec-not-browser-playable';
        }
    } else {
        targetBitrate = TIER_BITRATE[tier];
        if (!sourceIsLossless && nativelyPlayable && sourceBitrate > 0 && sourceBitrate <= targetBitrate) {
            // Re-encoding a lower-bitrate lossy source upward adds nothing but cost.
            mode = 'passthrough';
            reason = 'source-already-at-or-below-tier';
        } else {
            mode = 'transcode';
            targetFormat = 'mp3';
        }
    }

    if (mode === 'passthrough' && needsDownmix) {
        // Browsers can't decode >2ch / object audio - downmix is mandatory even
        // when the requested tier would otherwise be a plain passthrough.
        mode = 'transcode';
        targetFormat = 'mp3';
        reason = reason || 'multichannel-downmix';
        targetBitrate = targetBitrate || DOWNMIX_FALLBACK_BITRATE;
    }

    return { mode, targetFormat, targetBitrate, downmix: needsDownmix, reason };
}

/**
 * Describe, for the frontend quality selector, which tiers make sense for this track.
 */
function resolveAvailableTiers(trackMeta) {
    const sourceIsLossless = !!trackMeta?.is_lossless;
    const isAtmos = !!trackMeta?.is_atmos;
    const bitDepth = trackMeta?.bit_depth || null;
    const isHiRes = sourceIsLossless && !!bitDepth && bitDepth >= 24;

    // "Lossless" is available (and relabeled "Dolby Atmos" client-side) for Atmos sources
    // too, since it's the one slot that means "best possible rendition of this source" -
    // but hires/lossless resolve to byte-identical output for a lossy Atmos codec (EAC3
    // has no extra bit depth to unlock), so offering both as separate options is just
    // confusing ("I clicked Hi-Res and nothing happened"). Hi-Res stays reserved for
    // sources that are genuinely 24-bit+ lossless.
    const hiresAvailable = isHiRes;
    const losslessAvailable = sourceIsLossless || isAtmos;

    return {
        tiers: {
            hires: { available: hiresAvailable, disabledReason: hiresAvailable ? null : 'source-not-hires' },
            lossless: { available: losslessAvailable, disabledReason: losslessAvailable ? null : 'source-not-lossless' },
            '320': { available: true, disabledReason: null },
            '128': { available: true, disabledReason: null }
        },
        sourceIsLossless,
        sourceBitrate: trackMeta?.bitrate || null,
        sourceCodec: trackMeta?.codec || null,
        sourceChannels: trackMeta?.channels || null,
        isAtmos,
        atmosConfidence: trackMeta?.atmos_confidence || null,
        isMaxQuality: sourceIsLossless || isAtmos
    };
}

module.exports = { TIER_ORDER, resolveStreamPlan, resolveAvailableTiers, normalizeTier, NATIVE_PLAYABLE_CODECS };
