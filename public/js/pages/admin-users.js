import { Api, AppState } from '../api.js';

export async function renderUserManagement(container) {
    // Check if user is admin
    if (!AppState.user?.is_admin) {
        return container.innerHTML = '<div class="error-msg">Accès réservé aux administrateurs</div>';
    }

    container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';

    try {
        const users = await Api.getUsers();

        let html = `
            <h1 class="page-title">Gestion des Utilisateurs</h1>
            
            <div style="margin-bottom: 32px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
                    <div style="background: var(--bg-elevated); padding: 16px; border-radius: var(--radius-md);">
                        <p class="text-muted" style="font-size: 13px;">Total d'utilisateurs</p>
                        <p style="font-size: 28px; font-weight: 700;">${users.length}</p>
                    </div>
                    <div style="background: var(--bg-elevated); padding: 16px; border-radius: var(--radius-md);">
                        <p class="text-muted" style="font-size: 13px;">Administrateurs</p>
                        <p style="font-size: 28px; font-weight: 700;">${users.filter(u => u.is_admin).length}</p>
                    </div>
                </div>
            </div>

            <h2 class="section-title">Liste des Utilisateurs</h2>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--bg-elevated);">
                            <th style="text-align: left; padding: 12px 16px; font-weight: 600; font-size: 13px; color: var(--text-secondary); text-transform: uppercase;">Utilisateur</th>
                            <th style="text-align: left; padding: 12px 16px; font-weight: 600; font-size: 13px; color: var(--text-secondary); text-transform: uppercase;">Rôle</th>
                            <th style="text-align: left; padding: 12px 16px; font-weight: 600; font-size: 13px; color: var(--text-secondary); text-transform: uppercase;">Créé le</th>
                            <th style="text-align: left; padding: 12px 16px; font-weight: 600; font-size: 13px; color: var(--text-secondary); text-transform: uppercase;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => {
                            const createdDate = new Date(user.created_at).toLocaleDateString('fr-FR');
                            const isMe = user.id === AppState.user.id;
                            return `
                                <tr style="border-bottom: 1px solid var(--bg-elevated); transition: background 0.2s;" class="user-row" data-user-id="${user.id}">
                                    <td style="padding: 12px 16px; font-size: 14px;">${user.username}${isMe ? ' <span style="color: var(--accent); font-size: 12px;">(Vous)</span>' : ''}</td>
                                    <td style="padding: 12px 16px; font-size: 14px;">
                                        <span style="background: ${user.is_admin ? 'var(--accent)' : 'var(--bg-base)'}; color: ${user.is_admin ? 'var(--bg-base)' : 'var(--text-secondary)'}; padding: 4px 12px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600;">
                                            ${user.is_admin ? 'Admin' : 'Utilisateur'}
                                        </span>
                                    </td>
                                    <td style="padding: 12px 16px; font-size: 14px; color: var(--text-secondary);">${createdDate}</td>
                                    <td style="padding: 12px 16px;">
                                        <div style="display: flex; gap: 8px;">
                                            ${!isMe ? `
                                                <button class="btn-toggle-admin" data-user-id="${user.id}" style="padding: 6px 12px; font-size: 12px; background: var(--bg-elevated); border: 1px solid var(--bg-base); border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s;">
                                                    ${user.is_admin ? 'Retirer Admin' : 'Faire Admin'}
                                                </button>
                                                <button class="btn-delete-user" data-user-id="${user.id}" style="padding: 6px 12px; font-size: 12px; background: rgba(255, 85, 85, 0.1); border: 1px solid rgba(255, 85, 85, 0.3); color: #ff5555; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s;">
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

        // Hover effect on rows
        container.querySelectorAll('.user-row').forEach(row => {
            row.addEventListener('mouseenter', () => row.style.backgroundColor = 'var(--bg-elevated)');
            row.addEventListener('mouseleave', () => row.style.backgroundColor = 'transparent');
        });

        // Toggle admin
        container.querySelectorAll('.btn-toggle-admin').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = parseInt(btn.dataset.userId);
                const userRow = document.querySelector(`[data-user-id="${userId}"]`);
                const currentStatus = userRow.querySelector('span').textContent.includes('Admin');
                
                try {
                    btn.disabled = true;
                    await Api.setUserAdmin(userId, !currentStatus);
                    // Refresh
                    window.location.hash = '#/admin/users';
                } catch (err) {
                    alert('Erreur: ' + err.message);
                    btn.disabled = false;
                }
            });
        });

        // Delete user
        container.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = parseInt(btn.dataset.userId);
                if (confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
                    try {
                        btn.disabled = true;
                        await Api.deleteUser(userId);
                        // Refresh
                        window.location.hash = '#/admin/users';
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
