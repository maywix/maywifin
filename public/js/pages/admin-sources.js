import { Api, AppState } from '../api.js';
import { UploadManager } from '../upload-manager.js';

function normalizeJellyfinUrl(rawUrl) {
    if (!rawUrl) return '';
    let url = rawUrl.trim();
    url = url.replace(/^(https?):\/\/https?:\/\//i, '$1://');
    if (!/^https?:\/\//i.test(url)) {
        url = `http://${url}`;
    }
    return url;
}

const ACCEPTED_EXT = '.mp3,.flac,.wav,.m4a,.ogg,.aac,.opus,.wma,.aiff,.aif,.alac,.ape,.wv,.tta,.dts,.ac3,.eac3,.mlp,.ac4';

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// Each entry renders its own self-contained section. Adding a future source
// (e.g. Subsonic) means adding one more { id, label, render } entry here.
const SOURCES = [
    {
        id: 'local',
        label: 'Dossier Local',
        render(container) {
            container.innerHTML = `
                <div class="panel">
                    <h3>Dossier Local</h3>
                    <p class="panel-desc">Chemin vers votre dossier de musique sur la VM.</p>
                    <div class="input-row">
                        <input type="text" id="setting-local-path" class="input" placeholder="/mnt/music" value="${AppState.settings.source_local || ''}">
                        <button id="btn-save-local" class="btn btn-primary">Sauvegarder</button>
                        <button id="btn-scan" class="btn btn-outline">Scanner</button>
                    </div>
                    <div id="scan-status" class="status-msg"></div>

                    <div style="margin-top: 22px; padding-top: 22px; border-top: 1px solid var(--border-subtle);">
                        <h3>Actualisation automatique</h3>
                        <p class="panel-desc">Rescanne automatiquement le dossier musique à intervalles réguliers.</p>
                        <select id="setting-auto-scan" class="select" style="max-width: 260px;">
                            <option value="0">Désactivé</option>
                            <option value="3600">Toutes les heures</option>
                            <option value="21600">Toutes les 6 heures</option>
                            <option value="86400">Tous les jours</option>
                        </select>
                    </div>
                </div>

                <div class="panel">
                    <h3>Importer des fichiers</h3>
                    <p class="panel-desc">Envoyez des fichiers audio depuis votre ordinateur directement vers le dossier local ci-dessus (tous formats : FLAC, ALAC, APE, WavPack, PCM/WAV, MP3, AAC, Ogg/Opus, WMA, EAC3/AC3/DTS/TrueHD...). Un scan se relance automatiquement après l'import.</p>
                    <div id="upload-dropzone" class="dropzone">
                        <span class="material-symbols-rounded">upload_file</span>
                        <div class="dropzone-title">Glissez-déposez vos fichiers ici</div>
                        <div class="dropzone-hint">ou cliquez pour parcourir votre ordinateur</div>
                    </div>
                    <input type="file" id="upload-input" accept="${ACCEPTED_EXT}" multiple style="display: none;">
                    <div id="upload-file-list" class="upload-file-list"></div>
                </div>
            `;

            container.querySelector('#setting-auto-scan').value = AppState.settings.auto_scan_interval || '0';
            container.querySelector('#setting-auto-scan').addEventListener('change', async (e) => {
                const val = e.target.value;
                await Api.saveSetting('auto_scan_interval', val);
                AppState.settings.auto_scan_interval = val;
            });

            container.querySelector('#btn-save-local').addEventListener('click', async () => {
                const val = container.querySelector('#setting-local-path').value;
                await Api.saveSetting('source_local', val);
                AppState.settings.source_local = val;
                alert('Enregistré');
            });

            container.querySelector('#btn-scan').addEventListener('click', async () => {
                const statusEl = container.querySelector('#scan-status');
                statusEl.className = 'status-msg';
                try {
                    statusEl.textContent = 'Scanning...';
                    const res = await Api.scanLibrary();
                    AppState.library = await Api.getLocalLibrary();
                    const count = Number(res.tracks || 0);
                    statusEl.className = 'status-msg is-success';
                    statusEl.textContent = `Scan terminé: ${count} piste${count > 1 ? 's' : ''} (fichiers: ${res.filesFound || 0}, metadata KO: ${res.metadataFailures || 0}, non-audio: ${res.nonAudioSkipped || 0}, fallback: ${res.fallbackTracks || 0}, réutilisées du cache: ${res.reusedFromCache || 0}).`;
                } catch (e) {
                    statusEl.className = 'status-msg is-error';
                    statusEl.textContent = 'Erreur: ' + e.message;
                }
            });

            // --- Upload dropzone: enqueued into the global UploadManager, which
            // uploads 2 files at a time in the background (survives navigating away)
            // and triggers a single scan once the whole batch settles. This page just
            // renders a live view of that shared queue while it's mounted. ---
            const dropzone = container.querySelector('#upload-dropzone');
            const fileInput = container.querySelector('#upload-input');
            const fileListEl = container.querySelector('#upload-file-list');

            dropzone.addEventListener('click', () => fileInput.click());

            ['dragenter', 'dragover'].forEach((evt) => {
                dropzone.addEventListener(evt, (e) => {
                    e.preventDefault();
                    dropzone.classList.add('dragover');
                });
            });
            ['dragleave', 'drop'].forEach((evt) => {
                dropzone.addEventListener(evt, (e) => {
                    e.preventDefault();
                    dropzone.classList.remove('dragover');
                });
            });
            dropzone.addEventListener('drop', (e) => {
                const files = e.dataTransfer?.files;
                if (files && files.length > 0) UploadManager.enqueue(files);
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) UploadManager.enqueue(e.target.files);
                fileInput.value = '';
            });

            const statusEl = container.querySelector('#scan-status');
            const STATUS_LABEL = { pending: 'En attente…', uploading: 'Envoi…', done: '✓ Importé', error: 'Échec' };

            const unsubscribe = UploadManager.subscribe((state) => {
                fileListEl.innerHTML = state.items.map((item) => `
                    <div class="upload-file-row ${item.status === 'done' ? 'is-done' : ''} ${item.status === 'error' ? 'is-error' : ''}">
                        <span class="material-symbols-rounded">music_note</span>
                        <span class="upload-file-name">${item.file.name}</span>
                        <span class="text-muted text-xs">${formatBytes(item.file.size)}</span>
                        <span class="upload-file-status" title="${item.error || ''}">${item.status === 'uploading' ? (item.stallRetries > 0 ? `Reconnexion (${item.stallRetries}/4)…` : `${item.progress}%`) : STATUS_LABEL[item.status]}</span>
                        ${item.status === 'error' ? `<button class="btn btn-outline btn-sm btn-retry-upload" data-id="${item.id}">Réessayer</button>` : ''}
                    </div>
                `).join('');

                fileListEl.querySelectorAll('.btn-retry-upload').forEach((btn) => {
                    btn.addEventListener('click', () => UploadManager.retry(btn.dataset.id));
                });

                if (state.items.length === 0) return;

                if (state.isActive) {
                    statusEl.className = 'status-msg';
                    const done = state.items.filter((i) => i.status === 'done' || i.status === 'error').length;
                    statusEl.textContent = `Import en cours (2 fichiers max en parallèle) : ${done}/${state.items.length}…`;
                } else if (state.lastScanError) {
                    statusEl.className = 'status-msg is-error';
                    statusEl.textContent = `Fichiers importés, mais le scan automatique a échoué : ${state.lastScanError}`;
                } else if (state.lastScanResult) {
                    statusEl.className = 'status-msg is-success';
                    statusEl.textContent = `Import terminé et bibliothèque rescannée (${state.lastScanResult.tracks} pistes au total).`;
                }
            });

            // Stop updating this page's list once the user navigates away from Admin >
            // Sources - the upload itself (in UploadManager) keeps running regardless.
            const observer = new MutationObserver(() => {
                if (!document.body.contains(container)) {
                    unsubscribe();
                    observer.disconnect();
                }
            });
            observer.observe(document.getElementById('main-content'), { childList: true, subtree: true });
        }
    },
    {
        id: 'jellyfin',
        label: 'Jellyfin',
        render(container) {
            const hasPassword = Boolean(AppState.settings.source_jellyfin_password_set);
            container.innerHTML = `
                <div class="panel">
                    <h3>Jellyfin</h3>
                    <p class="panel-desc">Connexion à votre serveur Jellyfin.</p>
                    <div class="field">
                        <input type="text" id="setting-jf-url" class="input" placeholder="http://192.168.1.10:8096" value="${AppState.settings.source_jellyfin_url || ''}">
                    </div>
                    <div class="field">
                        <input type="text" id="setting-jf-username" class="input" placeholder="Nom d'utilisateur Jellyfin" value="${AppState.settings.source_jellyfin_username || ''}">
                    </div>
                    <div class="field">
                        <input type="password" id="setting-jf-password" class="input" placeholder="${hasPassword ? 'Laisser vide pour ne pas changer' : 'Mot de passe Jellyfin'}">
                    </div>
                    <div style="display:flex; gap:12px; align-items:center; flex-wrap: wrap;">
                        <button id="btn-save-jf" class="btn btn-primary">Sauvegarder Jellyfin</button>
                        <button id="btn-connect-jf" class="btn btn-outline">Tester Connexion</button>
                        <button id="btn-scan-jf" class="btn btn-outline">Scanner Jellyfin</button>
                    </div>
                    <div id="scan-jf-status" class="status-msg"></div>
                </div>
            `;

            const saveJfCreds = async () => {
                const url = normalizeJellyfinUrl(container.querySelector('#setting-jf-url').value);
                const username = container.querySelector('#setting-jf-username').value;
                const password = container.querySelector('#setting-jf-password').value;

                await Api.saveSetting('source_jellyfin_url', url);
                await Api.saveSetting('source_jellyfin_username', username);
                if (password) {
                    await Api.saveSetting('source_jellyfin_password', password);
                    await Api.saveSetting('source_jellyfin_apikey', '');
                    await Api.saveSetting('source_jellyfin_userid', '');
                }
                AppState.settings.source_jellyfin_url = url;
                AppState.settings.source_jellyfin_username = username;
            };

            container.querySelector('#btn-save-jf').addEventListener('click', async () => {
                await saveJfCreds();
                alert('Jellyfin Enregistré');
            });

            container.querySelector('#btn-connect-jf').addEventListener('click', async () => {
                const statusEl = container.querySelector('#scan-jf-status');
                statusEl.className = 'status-msg';
                try {
                    statusEl.textContent = 'Test de connexion Jellyfin...';
                    await saveJfCreds();
                    const result = await Api.connectJellyfin();
                    statusEl.className = 'status-msg is-success';
                    statusEl.textContent = result.message || 'Connexion Jellyfin réussie';
                } catch (e) {
                    statusEl.className = 'status-msg is-error';
                    statusEl.textContent = 'Erreur: ' + e.message;
                }
            });

            container.querySelector('#btn-scan-jf').addEventListener('click', async () => {
                const statusEl = container.querySelector('#scan-jf-status');
                statusEl.className = 'status-msg';
                try {
                    statusEl.textContent = 'Scan Jellyfin en cours...';
                    const res = await Api.scanJellyfinLibrary();
                    statusEl.className = 'status-msg is-success';
                    statusEl.textContent = (res.message || 'Scan Jellyfin déclenché.') + ' (la synchronisation peut prendre quelques secondes)';

                    try {
                        const jfTracksRaw = await Api.getJellyfinTracks();
                        const jfItems = Array.isArray(jfTracksRaw) ? jfTracksRaw : (jfTracksRaw.Items || []);
                        AppState.jellyfin.tracks = jfItems;
                    } catch (_e) {
                        // optional refresh; ignore failures here
                    }
                } catch (e) {
                    statusEl.className = 'status-msg is-error';
                    statusEl.textContent = 'Erreur: ' + e.message;
                }
            });
        }
    }
];

export async function renderAdminSources(container) {
    container.innerHTML = SOURCES.map((s) => `<div id="source-${s.id}"></div>`).join('');
    SOURCES.forEach((s) => {
        s.render(document.getElementById(`source-${s.id}`));
    });
}
