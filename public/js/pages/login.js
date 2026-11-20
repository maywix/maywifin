import { Api, AppState } from '../api.js';
import { appRouter } from '../app.js';

export async function renderLogin(container) {
    if (Api.getToken()) {
        return appRouter.handleRoute();
    }

    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh;">
            <div style="width: 100%; max-width: 380px; padding: 40px 28px;">
                <h1 style="text-align: center; font-size: 28px; font-weight: 800; margin-bottom: 6px;">MayWiFin</h1>
                <p class="text-secondary text-sm" style="text-align: center; margin-bottom: 32px;">Votre lecteur musical personnel</p>

                <div id="login-form">
                    <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 20px;">Connexion</h2>

                    <div class="field">
                        <label class="field-label">Nom d'utilisateur</label>
                        <input id="login-username" type="text" class="input" placeholder="mon_pseudo">
                    </div>

                    <div class="field">
                        <label class="field-label">Mot de passe</label>
                        <input id="login-password" type="password" class="input" placeholder="••••••">
                    </div>

                    <button id="btn-login" class="btn btn-primary btn-block">Se Connecter</button>

                    <p class="text-sm" style="text-align: center; margin-top: 16px;">
                        Pas encore de compte ? <a href="#" id="toggle-register" class="text-accent hover-underline" style="text-decoration: none;">S'inscrire</a>
                    </p>

                    <div id="login-error" class="error-msg" style="margin-top: 16px; display: none;"></div>
                </div>

                <div id="register-form" style="display: none;">
                    <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 20px;">Créer un compte</h2>

                    <div class="field">
                        <label class="field-label">Nom d'utilisateur</label>
                        <input id="register-username" type="text" class="input" placeholder="mon_pseudo">
                    </div>

                    <div class="field">
                        <label class="field-label">Mot de passe (min 6 caractères)</label>
                        <input id="register-password" type="password" class="input" placeholder="••••••">
                    </div>

                    <button id="btn-register" class="btn btn-primary btn-block">S'Inscrire</button>

                    <p class="text-sm" style="text-align: center; margin-top: 16px;">
                        Déjà inscrit ? <a href="#" id="toggle-login" class="text-accent hover-underline" style="text-decoration: none;">Se Connecter</a>
                    </p>

                    <div id="register-error" class="error-msg" style="margin-top: 16px; display: none;"></div>
                </div>
            </div>
        </div>
    `;

    let publicStatus = { allowPublicRegistration: true };
    try {
        publicStatus = await Api.getAuthPublicStatus();
    } catch (err) {
        console.error('Failed loading public auth status', err);
    }

    // Toggle between login and register (bound before the disabled-registration
    // branch below, which can remove #toggle-register from the DOM entirely).
    document.getElementById('toggle-register').addEventListener('click', (e) => {
        if (!publicStatus.allowPublicRegistration) return;
        e.preventDefault();
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
    });

    document.getElementById('toggle-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
    });

    if (!publicStatus.allowPublicRegistration) {
        document.getElementById('toggle-register').closest('p').innerHTML =
            '<span class="text-secondary text-sm">Création de compte désactivée (admin requis)</span>';
        document.getElementById('register-form').style.display = 'none';
    }

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
