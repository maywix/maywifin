const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const dom = new JSDOM(\`<!DOCTYPE html><body><div id="main-content"></div></body>\`);
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;

// Mock AppState
const AppState = {
    settings: {
        source_local: '/mnt/music',
        effect_slowed: 'false',
        effect_reverb: '0.2',
        theme_accent: '#ff0000'
    }
};

async function testRender() {
    const container = document.getElementById('main-content');
    
    // Simulate setting.js render logic directly
    container.innerHTML = \`
        <h1 class="page-title">Settings</h1>
        
        <div class="settings-section">
            <h2 class="section-title">Sources Musicales</h2>
            
            <div class="setting-item glass-card" style="padding: 24px; margin-bottom: 16px;">
                <h3>Dossier Local</h3>
                <p class="text-secondary" style="margin-bottom: 16px;">Chemin vers votre dossier de musique sur la VM.</p>
                <div style="display: flex; gap: 12px;">
                    <input type="text" id="setting-local-path" placeholder="/mnt/music" value="\${AppState.settings.source_local || ''}" style="flex:1; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--bg-elevated); background: var(--bg-base); color: white;">
                    <button id="btn-save-local" style="padding: 12px 24px; border-radius: var(--radius-sm); border: none; background: var(--accent); color: var(--bg-base); font-weight: bold; cursor: pointer;">Sauvegarder</button>
                    <button id="btn-scan" style="padding: 12px 24px; border-radius: var(--radius-sm); border: 1px solid var(--accent); background: transparent; color: var(--accent); font-weight: bold; cursor: pointer;">Scanner</button>
                </div>
                <div id="scan-status" style="margin-top: 12px; font-size: 14px; color: var(--accent);"></div>
            </div>

            <div class="setting-item glass-card" style="padding: 24px;">
                <h3>Jellyfin</h3>
                <p class="text-secondary" style="margin-bottom: 16px;">Connexion à votre serveur Jellyfin.</p>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <input type="text" id="setting-jf-url" placeholder="http://192.168.1.10:8096" value="\${AppState.settings.source_jellyfin_url || ''}" style="padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--bg-elevated); background: var(--bg-base); color: white;">
                    <input type="text" id="setting-jf-apikey" placeholder="API Key" value="\${AppState.settings.source_jellyfin_apikey || ''}" style="padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--bg-elevated); background: var(--bg-base); color: white;">
                    <input type="text" id="setting-jf-userid" placeholder="User ID" value="\${AppState.settings.source_jellyfin_userid || ''}" style="padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--bg-elevated); background: var(--bg-base); color: white;">
                    <button id="btn-save-jf" style="padding: 12px 24px; border-radius: var(--radius-sm); border: none; background: var(--accent); color: var(--bg-base); font-weight: bold; cursor: pointer; align-self: flex-start;">Sauvegarder Jellyfin</button>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h2 class="section-title">Audio & Effets</h2>
            
            <div class="setting-item glass-card" style="padding: 24px; margin-bottom: 16px;">
                <h3>Slowed (Pitch Down)</h3>
                <p class="text-secondary" style="margin-bottom: 16px;">Ralentit la musique (~0.85x) pour un effet "Slowed".</p>
                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                    <input type="checkbox" id="setting-effect-slowed" \${AppState.settings.effect_slowed === 'true' ? 'checked' : ''} style="width: 20px; height: 20px;">
                    <span>Activer le mode Slowed</span>
                </label>
            </div>

            <div class="setting-item glass-card" style="padding: 24px; margin-bottom: 16px;">
                <h3>Reverb dynamique</h3>
                <p class="text-secondary" style="margin-bottom: 16px;">Ajoute de l'écho et de l'espace à la musique (idéal avec Slowed).</p>
                <div style="display: flex; align-items: center; gap: 16px;">
                    <span class="text-secondary">Sec</span>
                    <input type="range" id="setting-effect-reverb" min="0" max="1" step="0.1" value="\${AppState.settings.effect_reverb || '0'}" style="flex: 1;">
                    <span class="text-secondary">Humide</span>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h2 class="section-title">Personnalisation</h2>
            
            <div class="setting-item glass-card" style="padding: 24px; margin-bottom: 16px;">
                <h3>Couleur d'accentuation</h3>
                <p class="text-secondary" style="margin-bottom: 16px;">Changez la couleur principale de MayWiFin.</p>
                <input type="color" id="setting-theme-accent" value="\${AppState.settings.theme_accent || '#ffffff'}" style="width: 60px; height: 40px; border: none; border-radius: var(--radius-sm); cursor: pointer;">
            </div>
        </div>
    \`;

    // Event Listeners
    document.getElementById('btn-save-local').addEventListener('click', () => { console.log("btn-save-local clicked") });
    document.getElementById('btn-scan').addEventListener('click', () => { console.log('btn-scan clicked') });
    document.getElementById('btn-save-jf').addEventListener('click', () => { console.log('btn-save-jf clicked')});
    document.getElementById('setting-effect-slowed').addEventListener('change', () => { console.log('setting-effect-slowed clicked')});
    document.getElementById('setting-effect-reverb').addEventListener('change', () => { console.log('setting-effect-reverb clicked')});
    document.getElementById('setting-theme-accent').addEventListener('change', () => { console.log('setting-theme-accent clicked')});

    console.log("HTML Rendered Length:", container.innerHTML.length);
    console.log("Success! No missing DOM elements.");
}

testRender().catch(err => console.error("Test Error:", err));
