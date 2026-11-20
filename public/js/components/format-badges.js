function badge(text, title) {
    return `<span title="${title}" style="display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: var(--radius-sm); background: var(--bg-elevated); color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; vertical-align: middle;">${text}</span>`;
}

// Only local-source tracks carry codec/channel metadata today (see routes/library.js Phase A).
export function renderFormatBadges(track) {
    if (!track || track.type !== 'local' || !track.codec) return '';

    let html = '';

    if (track.is_lossless && track.bit_depth && track.bit_depth >= 24) {
        html += badge('Hi-Res', `${track.codec.toUpperCase()} · ${track.bit_depth}bit/${Math.round((track.sample_rate || 0) / 1000)}kHz`);
    } else if (track.is_lossless) {
        html += badge('Lossless', track.codec.toUpperCase());
    }

    if (track.is_atmos) {
        const conf = track.atmos_confidence === 'confirmed' ? 'détecté' : 'probable, non garanti';
        html += badge('Atmos', `Dolby Atmos ${conf} (${track.codec.toUpperCase()})`);
    } else if (track.channels && track.channels > 2) {
        html += badge('Multicanal', `${track.channel_layout || track.channels + ' canaux'}`);
    }

    return html;
}
