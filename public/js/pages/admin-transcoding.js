import { Api, AppState } from '../api.js';

export async function renderAdminTranscoding(container) {
    container.innerHTML = `
        <div class="panel">
            <h3>Transcodages simultanés max.</h3>
            <p class="panel-desc">Limite le nombre de process ffmpeg lancés en parallèle, pour protéger le CPU d'un petit serveur perso.</p>
            <input type="number" id="setting-max-concurrent" class="input" style="width: 120px;" min="1" max="16" value="${AppState.settings.transcode_max_concurrent || '4'}">
        </div>

        <div class="panel">
            <h3>Qualité par défaut</h3>
            <p class="panel-desc">Qualité proposée par défaut dans le sélecteur du lecteur.</p>
            <select id="setting-default-tier" class="select" style="max-width: 260px;">
                <option value="hires">Hi-Res Lossless</option>
                <option value="lossless">Lossless</option>
                <option value="320">MP3 320 kbps</option>
                <option value="128">MP3 128 kbps</option>
            </select>
        </div>

        <div class="panel">
            <h3>État de ffmpeg</h3>
            <p class="panel-desc">Vérifie que ffmpeg est installé et accessible pour le transcodage à la volée.</p>
            <button id="btn-check-ffmpeg" class="btn btn-outline">Vérifier ffmpeg</button>
            <div id="ffmpeg-status" class="status-msg"></div>
        </div>
    `;

    container.querySelector('#setting-default-tier').value = AppState.settings.transcode_default_tier || 'lossless';

    container.querySelector('#setting-max-concurrent').addEventListener('change', async (e) => {
        const val = e.target.value;
        await Api.saveSetting('transcode_max_concurrent', val);
        AppState.settings.transcode_max_concurrent = val;
    });

    container.querySelector('#setting-default-tier').addEventListener('change', async (e) => {
        const val = e.target.value;
        await Api.saveSetting('transcode_default_tier', val);
        AppState.settings.transcode_default_tier = val;
    });

    container.querySelector('#btn-check-ffmpeg').addEventListener('click', async () => {
        const statusEl = container.querySelector('#ffmpeg-status');
        statusEl.className = 'status-msg';
        statusEl.textContent = 'Vérification...';
        try {
            const status = await Api.getFfmpegStatus();
            if (status.available) {
                statusEl.className = 'status-msg is-success';
                statusEl.textContent = `✓ ${status.version}`;
            } else {
                statusEl.className = 'status-msg is-error';
                statusEl.textContent = `✗ ffmpeg introuvable: ${status.error}`;
            }
        } catch (e) {
            statusEl.className = 'status-msg is-error';
            statusEl.textContent = 'Erreur: ' + e.message;
        }
    });
}
