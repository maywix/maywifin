import { Player } from '../player/player.js';
import { AudioEffects } from '../player/effects.js';
import { sessionFxState } from '../player/fx-session-state.js';

function slider(id, label, min, max, step, value, formatValue) {
    return `
        <div class="field">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <label for="${id}" style="font-size: 13.5px; font-weight: 600;">${label}</label>
                <span id="${id}-value" class="text-secondary text-sm" style="font-variant-numeric: tabular-nums;">${formatValue(value)}</span>
            </div>
            <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" style="width: 100%;">
        </div>
    `;
}

export function showFxModal() {
    // Deliberately NOT calling Player.init() here: connecting to Web Audio is a one-way
    // trip for the audio element's whole session, and multichannel/Atmos passthrough
    // tracks lose their surround channels going through that graph in practice. Only the
    // reverb sliders below actually need it, so they connect lazily on first real use.

    const modal = document.createElement('div');
    modal.id = 'fx-modal';
    modal.className = 'modal-overlay';

    const content = document.createElement('div');
    content.className = 'modal-card';
    content.style.maxWidth = '420px';

    content.innerHTML = `
        <button id="close-fx-modal" class="modal-close"><span class="material-symbols-rounded">close</span></button>
        <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">Effets</h2>
        <p class="text-muted text-xs" style="margin-bottom: 26px;">Réglages appliqués en direct. Ils sont conservés au rechargement de la page.</p>

        ${slider('fx-rate', 'Vitesse (Slowed / Sped up)', 0.5, 2.0, 0.01, sessionFxState.rateOverridden ? sessionFxState.rate : 1.0, (v) => `${parseFloat(v).toFixed(2)}x`)}
        ${slider('fx-wetdry', 'Reverb — Mix (sec / humide)', 0, 1, 0.01, sessionFxState.reverbWet, (v) => `${Math.round(v * 100)}%`)}
        ${slider('fx-decay', 'Reverb — Decay', 0.5, 6, 0.1, sessionFxState.reverbDecay, (v) => `${parseFloat(v).toFixed(1)}s`)}
        ${slider('fx-roomsize', 'Reverb — Taille de la pièce', 0.5, 6, 0.1, sessionFxState.reverbRoomSize, (v) => `${parseFloat(v).toFixed(1)}s`)}

        <button id="fx-reset" class="btn btn-outline btn-block" style="margin-top: 6px;">
            Réinitialiser (valeurs par défaut)
        </button>
    `;

    modal.appendChild(content);

    const closeModal = () => modal.remove();
    content.querySelector('#close-fx-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    const rateInput = content.querySelector('#fx-rate');
    const wetDryInput = content.querySelector('#fx-wetdry');
    const decayInput = content.querySelector('#fx-decay');
    const roomSizeInput = content.querySelector('#fx-roomsize');

    let reverbDebounce = null;
    const applyReverbShape = () => {
        clearTimeout(reverbDebounce);
        reverbDebounce = setTimeout(() => {
            AudioEffects.setReverbShape({ decay: sessionFxState.reverbDecay, roomSize: sessionFxState.reverbRoomSize });
        }, 100);
    };

    rateInput.addEventListener('input', (e) => {
        const rate = parseFloat(e.target.value);
        sessionFxState.rate = rate;
        sessionFxState.rateOverridden = true;
        content.querySelector('#fx-rate-value').textContent = `${rate.toFixed(2)}x`;
        Player.setRate(rate);
    });

    // Only actually need to (idempotently) connect Web Audio once, not on every single
    // 'input' tick while dragging - cheap either way since Player.init() already guards
    // itself, but this keeps the drag handlers from doing pointless work mid-gesture.
    let webAudioReady = false;
    const ensureWebAudio = () => {
        if (webAudioReady) return;
        Player.init();
        webAudioReady = true;
    };

    wetDryInput.addEventListener('input', (e) => {
        const wet = parseFloat(e.target.value);
        sessionFxState.reverbWet = wet;
        sessionFxState.reverbOverridden = true;
        content.querySelector('#fx-wetdry-value').textContent = `${Math.round(wet * 100)}%`;
        if (wet > 0) ensureWebAudio();
        AudioEffects.setReverb(wet);
    });

    decayInput.addEventListener('input', (e) => {
        const decay = parseFloat(e.target.value);
        sessionFxState.reverbDecay = decay;
        sessionFxState.reverbOverridden = true;
        content.querySelector('#fx-decay-value').textContent = `${decay.toFixed(1)}s`;
        ensureWebAudio();
        applyReverbShape();
    });

    roomSizeInput.addEventListener('input', (e) => {
        const roomSize = parseFloat(e.target.value);
        sessionFxState.reverbRoomSize = roomSize;
        sessionFxState.reverbOverridden = true;
        content.querySelector('#fx-roomsize-value').textContent = `${roomSize.toFixed(1)}s`;
        ensureWebAudio();
        applyReverbShape();
    });

    content.querySelector('#fx-reset').addEventListener('click', () => {
        sessionFxState.rateOverridden = false;
        sessionFxState.reverbOverridden = false;
        sessionFxState.rate = 1.0;
        sessionFxState.reverbWet = 0;
        sessionFxState.reverbDecay = 3;
        sessionFxState.reverbRoomSize = 3;

        rateInput.value = 1.0;
        wetDryInput.value = 0;
        decayInput.value = 3;
        roomSizeInput.value = 3;
        content.querySelector('#fx-rate-value').textContent = '1.00x';
        content.querySelector('#fx-wetdry-value').textContent = '0%';
        content.querySelector('#fx-decay-value').textContent = '3.0s';
        content.querySelector('#fx-roomsize-value').textContent = '3.0s';

        Player.setRate(1.0);
        AudioEffects.setReverb(0);
        AudioEffects.setReverbShape({ decay: 3, roomSize: 3 });
    });

    document.body.appendChild(modal);
}
