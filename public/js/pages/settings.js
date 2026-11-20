import { Api, AppState } from '../api.js';

export async function renderSettings(container) {
    container.innerHTML = `
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Préférences personnelles. La gestion des sources et de la bibliothèque se trouve dans <a href="#/admin" class="text-accent hover-underline">Admin</a>.</p>

        <div class="settings-section">
            <h2 class="section-title">Audio & Effets</h2>
            <p class="panel-desc" style="margin-bottom: 16px;">Réglages par défaut. Pour des ajustements précis pendant l'écoute, utilisez le bouton <strong>Effets</strong> (icône égaliseur) dans la barre de lecture.</p>

            <div class="panel">
                <h3>Slowed (Pitch Down)</h3>
                <p class="panel-desc">Ralentit la musique (~0.85x) par défaut pour un effet "Slowed".</p>
                <label class="checkbox-row">
                    <input type="checkbox" id="setting-effect-slowed" ${AppState.settings.effect_slowed === 'true' ? 'checked' : ''}>
                    <span>Activer le mode Slowed par défaut</span>
                </label>
            </div>

            <div class="panel">
                <h3>Reverb par défaut</h3>
                <p class="panel-desc">Ajoute de l'écho et de l'espace à la musique (idéal avec Slowed).</p>
                <div style="display: flex; align-items: center; gap: 16px;">
                    <span class="text-secondary text-xs">Sec</span>
                    <input type="range" id="setting-effect-reverb" min="0" max="1" step="0.1" value="${AppState.settings.effect_reverb || '0'}" style="flex: 1;">
                    <span class="text-secondary text-xs">Humide</span>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h2 class="section-title">Personnalisation</h2>

            <div class="panel">
                <h3>Couleur d'accentuation</h3>
                <p class="panel-desc">Changez la couleur principale de MayWiFin.</p>
                <input type="color" id="setting-theme-accent" class="input" value="${AppState.settings.theme_accent || '#ffffff'}">
            </div>
        </div>
    `;

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
}
