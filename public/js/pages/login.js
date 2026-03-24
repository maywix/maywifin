import { Api, AppState } from '../api.js';
import { appRouter } from '../app.js';

export async function renderLogin(container) {
    // Check if already logged in
    if (Api.getToken()) {
        return appRouter.handleRoute();
    }

    let html = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: var(--bg-base);">
            <div style="width: 100%; max-width: 400px; padding: 40px 32px;">
                <h1 style="text-align: center; font-size: 32px; margin-bottom: 8px;">MayWiFin</h1>
                <p style="text-align: center; font-size: 14px; color: var(--text-secondary); margin-bottom: 32px;">Votre lecteur musical personnel</p>
                
                <div id="login-form" style="display: block;">
                    <h2 style="font-size: 20px; margin-bottom: 24px;">Connexion</h2>
                    
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600;">Nom d'utilisateur</label>
                        <input id="login-username" type="text" placeholder="mon_pseudo" style="width: 100%; padding: 10px 12px; border: 1px solid var(--bg-elevated); border-radius: var(--radius-sm); background: var(--bg-elevated); color: var(--text-primary); font-size: 14px; box-sizing: border-box;">
                    </div>
                    
                    <div style="margin-bottom: 24px;">
                        <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600;">Mot de passe</label>
                        <input id="login-password" type="password" placeholder="••••••" style="width: 100%; padding: 10px 12px; border: 1px solid var(--bg-elevated); border-radius: var(--radius-sm); background: var(--bg-elevated); color: var(--text-primary); font-size: 14px; box-sizing: border-box;">
                    </div>
                    
                    <button id="btn-login" style="width: 100%; padding: 12px; background: var(--accent); color: var(--bg-base); border: none; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer; font-size: 14px; transition: opacity 0.2s;">
                        Se Connecter
                    </button>
                    
                    <p style="text-align: center; margin-top: 16px; font-size: 14px;">
                        Pas encore de compte ? <a href="#" id="toggle-register" style="color: var(--accent); cursor: pointer; text-decoration: none;">S'inscrire</a>
                    </p>
                    
                    <div id="login-error" style="margin-top: 16px; padding: 12px; border-radius: var(--radius-sm); background: rgba(255, 85, 85, 0.1); color: #ff5555; display: none; font-size: 13px;"></div>
                </div>

                <div id="register-form" style="display: none;">
                    <h2 style="font-size: 20px; margin-bottom: 24px;">Créer un compte</h2>
                    
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600;">Nom d'utilisateur</label>
                        <input id="register-username" type="text" placeholder="mon_pseudo" style="width: 100%; padding: 10px 12px; border: 1px solid var(--bg-elevated); border-radius: var(--radius-sm); background: var(--bg-elevated); color: var(--text-primary); font-size: 14px; box-sizing: border-box;">
                    </div>
                    
                    <div style="margin-bottom: 24px;">
                        <label style="display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600;">Mot de passe (min 6 caractères)</label>
                        <input id="register-password" type="password" placeholder="••••••" style="width: 100%; padding: 10px 12px; border: 1px solid var(--bg-elevated); border-radius: var(--radius-sm); background: var(--bg-elevated); color: var(--text-primary); font-size: 14px; box-sizing: border-box;">
                    </div>
                    
                    <button id="btn-register" style="width: 100%; padding: 12px; background: var(--accent); color: var(--bg-base); border: none; border-radius: var(--radius-sm); font-weight: 600; cursor: pointer; font-size: 14px; transition: opacity 0.2s;">
                        S'Inscrire
                    </button>
                    
                    <p style="text-align: center; margin-top: 16px; font-size: 14px;">
                        Déjà inscrit ? <a href="#" id="toggle-login" style="color: var(--accent); cursor: pointer; text-decoration: none;">Se Connecter</a>
                    </p>
                    
                    <div id="register-error" style="margin-top: 16px; padding: 12px; border-radius: var(--radius-sm); background: rgba(255, 85, 85, 0.1); color: #ff5555; display: none; font-size: 13px;"></div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Toggle between login and register
    document.getElementById('toggle-register').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
    });

    document.getElementById('toggle-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
    });

    // Login
    document.getElementById('btn-login').addEventListener('click', async () => {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');

        if (!username || !password) {
            errorDiv.textContent = 'Veuillez remplir tous les champs';
            errorDiv.style.display = 'block';
            return;
        }

        try {
            document.getElementById('btn-login').disabled = true;
            const response = await Api.login(username, password);
            Api.setToken(response.token);
            AppState.user = response.user;
            window.location.hash = '#/';
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.style.display = 'block';
            document.getElementById('btn-login').disabled = false;
        }
    });

    // Register
    document.getElementById('btn-register').addEventListener('click', async () => {
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        const errorDiv = document.getElementById('register-error');

        if (!username || !password) {
            errorDiv.textContent = 'Veuillez remplir tous les champs';
            errorDiv.style.display = 'block';
            return;
        }

        if (password.length < 6) {
            errorDiv.textContent = 'Le mot de passe doit contenir au moins 6 caractères';
            errorDiv.style.display = 'block';
            return;
        }

        try {
            document.getElementById('btn-register').disabled = true;
            const response = await Api.register(username, password);
            Api.setToken(response.token);
            AppState.user = response.user;
            window.location.hash = '#/';
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.style.display = 'block';
            document.getElementById('btn-register').disabled = false;
        }
    });
}
