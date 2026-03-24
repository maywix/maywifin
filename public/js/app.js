import { Api } from './api.js';
import { renderHome } from './pages/home.js';
import { renderLibrary } from './pages/library.js';
import { renderSettings } from './pages/settings.js';

// Simple SPA Router
class Router {
    constructor() {
        this.routes = {};
        this.currentPath = '';
        this.container = document.getElementById('main-content');
        this.navLinks = document.querySelectorAll('.nav-btn');

        window.addEventListener('hashchange', () => this.handleRoute());
    }

    add(path, renderFunction) {
        this.routes[path] = renderFunction;
    }

    async handleRoute() {
        if (!window.location.hash) {
            window.location.hash = '/';
            return;
        }

        const hash = window.location.hash.substring(1);
        const parts = hash.split('?');
        const path = parts[0];
        
        let matchedRoute = this.routes[path];
        let params = {};
        
        if (!matchedRoute) {
            for (const routePath in this.routes) {
                if (routePath.includes(':')) {
                    const routeParts = routePath.split('/');
                    const pathParts = path.split('/');
                    
                    if (routeParts.length === pathParts.length && routeParts[1] === pathParts[1]) {
                        matchedRoute = this.routes[routePath];
                        params.id = pathParts[2];
                        break;
                    }
                }
            }
        }

        this.currentPath = path;

        this.navLinks.forEach(link => {
            if (path.startsWith(link.getAttribute('data-route')) && link.getAttribute('data-route') !== '/' ||
                (path === '/' && link.getAttribute('data-route') === '/')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        if (matchedRoute) {
            this.container.innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
            try {
                await matchedRoute(this.container, params);
                this.container.firstElementChild?.classList.add('fade-in');
            } catch (err) {
                console.error("Route render error:", err);
                this.container.innerHTML = `<div class="error-msg">Failed to load view: ${err.message}</div>`;
            }
        } else {
            this.container.innerHTML = '<h2>404 - Page non trouvée / En construction</h2>';
        }
    }
}

export const appRouter = new Router();

// Register Routes
import { renderRadio } from './pages/radio.js';
import { renderPlaylist } from './pages/playlist.js';
import { renderArtist } from './pages/artist.js';
import { renderAlbum } from './pages/album.js';

appRouter.add('/', renderHome);
appRouter.add('/library', renderLibrary);
appRouter.add('/settings', renderSettings);
appRouter.add('/radio', renderRadio);
appRouter.add('/playlists', renderPlaylist);
appRouter.add('/artist/:id', renderArtist);
appRouter.add('/album/:id', renderAlbum);

// Global App State & Init
export const AppState = {
    settings: {},
    library: { artists: {}, albums: {}, tracks: [] },
    jellyfin: { artists: [], albums: [], tracks: [] }
};

async function initApp() {
    try {
        AppState.settings = await Api.getSettings();
        
        if (AppState.settings.theme_accent) {
            document.documentElement.style.setProperty('--accent', AppState.settings.theme_accent);
        }

        appRouter.handleRoute();

        document.getElementById('close-panel').addEventListener('click', () => {
             document.getElementById('right-panel').classList.add('hidden');
        });

        document.getElementById('btn-lyrics').addEventListener('click', () => {
            const panel = document.getElementById('right-panel');
            document.getElementById('panel-title').textContent = "Paroles";
            panel.classList.toggle('hidden');
        });

    } catch (err) {
        console.error("App init failed:", err);
    }
}

document.addEventListener('DOMContentLoaded', initApp);
