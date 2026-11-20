import { AppState } from '../api.js';
import { renderAdminSources } from './admin-sources.js';
import { renderAdminLibrary } from './admin-library.js';
import { renderAdminTranscoding } from './admin-transcoding.js';
import { renderUserManagement } from './admin-users.js';

const TABS = [
    { id: 'sources', label: 'Sources', render: renderAdminSources },
    { id: 'library', label: 'Bibliothèque', render: renderAdminLibrary },
    { id: 'transcoding', label: 'Transcodage', render: renderAdminTranscoding },
    { id: 'users', label: 'Utilisateurs', render: renderUserManagement }
];

export async function renderAdmin(container, params) {
    if (!AppState.user?.is_admin) {
        container.innerHTML = '<div class="error-msg">Accès réservé aux administrateurs.</div>';
        return;
    }

    // The router's dynamic matcher stores the wildcard segment in params.id regardless of name.
    const activeTab = TABS.find((t) => t.id === params.id)?.id || 'sources';

    container.innerHTML = `
        <h1 class="page-title">Administration</h1>
        <p class="page-subtitle">Sources musicales, état de la bibliothèque, transcodage et utilisateurs.</p>
        <div class="tabs">
            ${TABS.map((t) => `
                <button class="tab-btn ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>
            `).join('')}
        </div>
        <div id="admin-tab-content"></div>
    `;

    container.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            window.location.hash = `#/admin/${btn.dataset.tab}`;
        });
    });

    const tab = TABS.find((t) => t.id === activeTab);
    const tabContainer = document.getElementById('admin-tab-content');
    await tab.render(tabContainer);
}
