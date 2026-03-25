import { Api, AppState } from '../api.js';

export async function renderSettings(container) {
    const normalizeJellyfinUrl = (rawUrl) => {
        if (!rawUrl) return '';
        let url = rawUrl.trim();
        url = url.replace(/^(https?):\/\/https?:\/\//i, '$1://');
        if (!/^https?:\/\//i.test(url)) {
            url = `http://${url}`;
        }
        return url;
    };

    container.innerHTML = `
        <h1 class="page-title">Settings</h1>
        
        <div class="settings-section">
            <h2 class="section-title">Sources Musicales</h2>
            
            <div class="setting-item glass-card" style="padding: 24px; margin-bottom: 16px;">
                <h3>Dossier Local</h3>
                <p class="text-secondary" style="margin-bottom: 16px;">Chemin vers votre dossier de musique sur la VM.</p>
                <div style="display: flex; gap: 12px;">
                    <input type="text" id="setting-local-path" placeholder="/mnt/music" value="${AppState.settings.source_local || ''}" style="flex:1; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--bg-elevated); background: var(--bg-base); color: white;">
                    <button id="btn-save-local" style="padding: 12px 24px; border-radius: var(--radius-sm); border: none; background: var(--accent); color: var(--bg-base); font-weight: bold; cursor: pointer;">Sauvegarder</button>
                    <button id="btn-scan" style="padding: 12px 24px; border-radius: var(--radius-sm); border: 1px solid var(--accent); background: transparent; color: var(--accent); font-weight: bold; cursor: pointer;">Scanner</button>
                </div>
                <div id="scan-status" style="margin-top: 12px; font-size: 14px; color: var(--accent);"></div>
            </div>

            <div class="setting-item glass-card" style="padding: 24px;">
                <h3>Jellyfin</h3>
                <p class="text-secondary" style="margin-bottom: 16px;">Connexion à votre serveur Jellyfin.</p>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <input type="text" id="setting-jf-url" placeholder="http://192.168.1.10:8096" value="${AppState.settings.source_jellyfin_url || ''}" style="padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--bg-elevated); background: var(--bg-base); color: white;">
                    <input type="text" id="setting-jf-username" placeholder="Nom d'utilisateur Jellyfin" value="${AppState.settings.source_jellyfin_username || ''}" style="padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--bg-elevated); background: var(--bg-base); color: white;">
                    <input type="password" id="setting-jf-password" placeholder="Mot de passe Jellyfin" value="${AppState.settings.source_jellyfin_password || ''}" style="padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--bg-elevated); background: var(--bg-base); color: white;">
                    <div style="display:flex; gap:12px; align-items:center;">
                        <button id="btn-save-jf" style="padding: 12px 24px; border-radius: var(--radius-sm); border: none; background: var(--accent); color: var(--bg-base); font-weight: bold; cursor: pointer;">Sauvegarder Jellyfin</button>
                        <button id="btn-connect-jf" style="padding: 12px 24px; border-radius: var(--radius-sm); border: 1px solid var(--accent); background: transparent; color: var(--accent); font-weight: bold; cursor: pointer;">Tester Connexion</button>
                        <button id="btn-scan-jf" style="padding: 12px 24px; border-radius: var(--radius-sm); border: 1px solid var(--accent); background: transparent; color: var(--accent); font-weight: bold; cursor: pointer;">Scanner Jellyfin</button>
                    </div>
                    <div id="scan-jf-status" style="font-size: 14px; color: var(--accent);"></div>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h2 class="section-title">Audio & Effets</h2>
            
            <div class="setting-item glass-card" style="padding: 24px; margin-bottom: 16px;">
                <h3>Slowed (Pitch Down)</h3>
                <p class="text-secondary" style="margin-bottom: 16px;">Ralentit la musique (~0.85x) pour un effet "Slowed".</p>
                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                    <input type="checkbox" id="setting-effect-slowed" ${AppState.settings.effect_slowed === 'true' ? 'checked' : ''} style="width: 20px; height: 20px;">
                    <span>Activer le mode Slowed</span>
                </label>
            </div>

            <div class="setting-item glass-card" style="padding: 24px; margin-bottom: 16px;">
                <h3>Reverb dynamique</h3>
                <p class="text-secondary" style="margin-bottom: 16px;">Ajoute de l'écho et de l'espace à la musique (idéal avec Slowed).</p>
                <div style="display: flex; align-items: center; gap: 16px;">
                    <span class="text-secondary">Sec</span>
                    <input type="range" id="setting-effect-reverb" min="0" max="1" step="0.1" value="${AppState.settings.effect_reverb || '0'}" style="flex: 1;">
                    <span class="text-secondary">Humide</span>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h2 class="section-title">Personnalisation</h2>

            <div class="setting-item glass-card" style="padding: 24px; margin-bottom: 16px;">
                <h3>Actualisation Automatique de la Médiathèque</h3>
                <p class="text-secondary" style="margin-bottom: 16px;">Rescanne automatiquement votre dossier musique à intervalles réguliers.</p>
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
                    <select id="setting-auto-scan" style="padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--bg-elevated); background: var(--bg-elevated); color: var(--text-primary);">
                        <option value="0">Désactivé</option>
                        <option value="3600">Toutes les heures</option>
                        <option value="21600">Toutes les 6 heures</option>
                        <option value="86400">Tous les jours</option>
                    </select>
                </div>
            </div>
            
            <div class="setting-item glass-card" style="padding: 24px; margin-bottom: 16px;">
                <h3>Couleur d'accentuation</h3>
                <p class="text-secondary" style="margin-bottom: 16px;">Changez la couleur principale de MayWiFin.</p>
                <input type="color" id="setting-theme-accent" value="${AppState.settings.theme_accent || '#ffffff'}" style="width: 60px; height: 40px; border: none; border-radius: var(--radius-sm); cursor: pointer;">
            </div>
            </div>
    `;

    // Event Listeners
    document.getElementById('btn-save-local').addEventListener('click', async () => {
        const val = document.getElementById('setting-local-path').value;
        await Api.saveSetting('source_local', val);
        AppState.settings.source_local = val;
        alert("Enregistré");
    });

    document.getElementById('btn-scan').addEventListener('click', async () => {
        const statusEl = document.getElementById('scan-status');
        try {
            statusEl.textContent = "Scanning...";
            const res = await Api.scanLibrary();
            AppState.library = await Api.getLocalLibrary();
            const count = Number(res.tracks || 0);
            const filesFound = Number(res.filesFound || 0);
            const metadataFailures = Number(res.metadataFailures || 0);
            const nonAudioSkipped = Number(res.nonAudioSkipped || 0);
            const fallbackTracks = Number(res.fallbackTracks || 0);
            statusEl.textContent = `Scan terminé: ${count} piste${count > 1 ? 's' : ''} (fichiers: ${filesFound}, metadata KO: ${metadataFailures}, non-audio: ${nonAudioSkipped}, fallback: ${fallbackTracks}).`;
        } catch (e) {
            statusEl.textContent = "Erreur: " + e.message;
        }
    });

    document.getElementById('btn-save-jf').addEventListener('click', async () => {
        const url = normalizeJellyfinUrl(document.getElementById('setting-jf-url').value);
        const username = document.getElementById('setting-jf-username').value;
        const password = document.getElementById('setting-jf-password').value;
        await Api.saveSetting('source_jellyfin_url', url);
        await Api.saveSetting('source_jellyfin_username', username);
        await Api.saveSetting('source_jellyfin_password', password);
        // clear legacy fields
        await Api.saveSetting('source_jellyfin_apikey', '');
        await Api.saveSetting('source_jellyfin_userid', '');
        AppState.settings.source_jellyfin_url = url;
        AppState.settings.source_jellyfin_username = username;
        AppState.settings.source_jellyfin_password = password;
        AppState.settings.source_jellyfin_apikey = '';
        AppState.settings.source_jellyfin_userid = '';
        alert("Jellyfin Enregistré");
    });

    document.getElementById('btn-connect-jf').addEventListener('click', async () => {
        const statusEl = document.getElementById('scan-jf-status');
        try {
            statusEl.textContent = 'Test de connexion Jellyfin...';

            // Save latest form values first
            const url = normalizeJellyfinUrl(document.getElementById('setting-jf-url').value);
            const username = document.getElementById('setting-jf-username').value;
            const password = document.getElementById('setting-jf-password').value;
            await Api.saveSetting('source_jellyfin_url', url);
            await Api.saveSetting('source_jellyfin_username', username);
            await Api.saveSetting('source_jellyfin_password', password);
            await Api.saveSetting('source_jellyfin_apikey', '');
            await Api.saveSetting('source_jellyfin_userid', '');

            const result = await Api.connectJellyfin();
            statusEl.textContent = result.message || 'Connexion Jellyfin réussie';
        } catch (e) {
            statusEl.textContent = 'Erreur: ' + e.message;
        }
    });

    document.getElementById('btn-scan-jf').addEventListener('click', async () => {
        const statusEl = document.getElementById('scan-jf-status');
        try {
            statusEl.textContent = 'Scan Jellyfin en cours...';
            const res = await Api.scanJellyfinLibrary();
            statusEl.textContent = (res.message || 'Scan Jellyfin déclenché.') + ' (la synchronisation peut prendre quelques secondes)';

            // Refresh jellyfin cache in app state
            try {
                const jfTracksRaw = await Api.getJellyfinTracks();
                const jfItems = Array.isArray(jfTracksRaw) ? jfTracksRaw : (jfTracksRaw.Items || []);
                AppState.jellyfin.tracks = jfItems;
            } catch (_e) {
                // optional refresh; ignore failures here
            }
        } catch (e) {
            statusEl.textContent = 'Erreur: ' + e.message;
        }
    });

    // Instant save for checkboxes and ranges
    document.getElementById('setting-effect-slowed').addEventListener('change', async (e) => {
        const val = e.target.checked ? 'true' : 'false';
        await Api.saveSetting('effect_slowed', val);
        AppState.settings.effect_slowed = val;
    });

    document.getElementById('setting-effect-reverb').addEventListener('change', async (e) => {
        const val = e.target.value;
        await Api.saveSetting('effect_reverb', val);
        AppState.settings.effect_reverb = val;
    });

    document.getElementById('setting-theme-accent').addEventListener('change', async (e) => {
        const val = e.target.value;
        await Api.saveSetting('theme_accent', val);
        AppState.settings.theme_accent = val;
        document.documentElement.style.setProperty('--accent', val);
    });

    // Auto-scan
    document.getElementById('setting-auto-scan').addEventListener('change', async (e) => {
        const val = e.target.value;
        await Api.saveSetting('auto_scan_interval', val);
        AppState.settings.auto_scan_interval = val;
    });

    // Initialize auto-scan select with saved value
    document.getElementById('setting-auto-scan').value = AppState.settings.auto_scan_interval || '0';
}
