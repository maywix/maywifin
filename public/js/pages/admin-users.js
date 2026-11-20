import { Api, AppState } from '../api.js';

export async function renderUserManagement(container) {
    if (!AppState.user?.is_admin) {
        return container.innerHTML = '<div class="error-msg">Accès réservé aux administrateurs</div>';
    }

    container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';

    try {
        const users = await Api.getUsers();

        let html = `
            <div class="stat-grid" style="max-width: 480px;">
                <div class="stat-tile">
                    <p class="stat-label">Total d'utilisateurs</p>
                    <p class="stat-value">${users.length}</p>
                </div>
                <div class="stat-tile">
                    <p class="stat-label">Administrateurs</p>
                    <p class="stat-value">${users.filter(u => u.is_admin).length}</p>
                </div>
            </div>

            <h2 class="section-title">Liste des utilisateurs</h2>
            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Utilisateur</th>
                            <th>Rôle</th>
                            <th>Créé le</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => {
                            const createdDate = new Date(user.created_at).toLocaleDateString('fr-FR');
                            const isMe = user.id === AppState.user.id;
                            return `
                                <tr data-user-id="${user.id}">
                                    <td>${user.username}${isMe ? ' <span class="text-accent text-xs">(Vous)</span>' : ''}</td>
                                    <td><span class="badge ${user.is_admin ? 'badge-accent' : ''}">${user.is_admin ? 'Admin' : 'Utilisateur'}</span></td>
                                    <td class="text-secondary">${createdDate}</td>
                                    <td>
                                        <div style="display: flex; gap: 8px;">
                                            ${!isMe ? `
                                                <button class="btn btn-outline btn-sm btn-toggle-admin" data-user-id="${user.id}">
                                                    ${user.is_admin ? 'Retirer Admin' : 'Faire Admin'}
                                                </button>
                                                <button class="btn btn-danger btn-sm btn-delete-user" data-user-id="${user.id}">
                                                    Supprimer
                                                </button>
                                            ` : ''}
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;

        container.querySelectorAll('.btn-toggle-admin').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = parseInt(btn.dataset.userId);
                const userRow = document.querySelector(`[data-user-id="${userId}"]`);
                const currentStatus = userRow.querySelector('.badge').textContent.includes('Admin');

                try {
                    btn.disabled = true;
                    await Api.setUserAdmin(userId, !currentStatus);
                    renderUserManagement(container);
                } catch (err) {
                    alert('Erreur: ' + err.message);
                    btn.disabled = false;
                }
            });
        });

        container.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = parseInt(btn.dataset.userId);
                if (confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
                    try {
                        btn.disabled = true;
                        await Api.deleteUser(userId);
                        renderUserManagement(container);
                    } catch (err) {
                        alert('Erreur: ' + err.message);
                        btn.disabled = false;
                    }
                }
            });
        });

    } catch (err) {
        container.innerHTML = `<div class="error-msg">Erreur: ${err.message}</div>`;
    }
}
