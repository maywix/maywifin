import { Api } from '../api.js';

export async function renderAdminLibrary(container) {
    container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';

    try {
        const stats = await Api.getLibraryStats();

        const codecRows = (stats.byCodec || [])
            .map((c) => `<tr><td>${c.codec || 'inconnu'}</td><td style="text-align: right;">${c.count}</td></tr>`)
            .join('');

        const errorRows = (stats.errors || [])
            .slice(0, 50)
            .map((e) => `<tr><td>${e.title || e.path}</td><td class="text-secondary">${e.scan_error}</td></tr>`)
            .join('');

        container.innerHTML = `
            <div class="stat-grid">
                <div class="stat-tile">
                    <p class="stat-label">Pistes locales</p>
                    <p class="stat-value">${stats.total}</p>
                </div>
                <div class="stat-tile">
                    <p class="stat-label">Lossless</p>
                    <p class="stat-value">${stats.lossless}</p>
                </div>
                <div class="stat-tile">
                    <p class="stat-label">Lossy</p>
                    <p class="stat-value">${stats.lossy}</p>
                </div>
                <div class="stat-tile">
                    <p class="stat-label">Atmos détecté</p>
                    <p class="stat-value">${stats.atmos}</p>
                </div>
                <div class="stat-tile">
                    <p class="stat-label">Multicanal</p>
                    <p class="stat-value">${stats.multichannel}</p>
                </div>
            </div>

            <h2 class="section-title">Répartition par codec</h2>
            <div class="table-wrap" style="margin-bottom: 32px;">
                <table class="data-table">
                    <thead>
                        <tr><th>Codec</th><th style="text-align: right;">Pistes</th></tr>
                    </thead>
                    <tbody>${codecRows || '<tr><td colspan="2" class="text-muted">Aucune donnée. Lancez un scan depuis l\'onglet Sources.</td></tr>'}</tbody>
                </table>
            </div>

            ${stats.errors && stats.errors.length > 0 ? `
                <h2 class="section-title">Erreurs de scan (${stats.errors.length})</h2>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr><th>Fichier</th><th>Erreur</th></tr>
                        </thead>
                        <tbody>${errorRows}</tbody>
                    </table>
                </div>
            ` : ''}
        `;
    } catch (err) {
        container.innerHTML = `<div class="error-msg">Erreur: ${err.message}</div>`;
    }
}
