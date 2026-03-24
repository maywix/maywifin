import { Api, AppState } from "./api.js";
import { showNowPlayingModal } from "./components/nowplaying-modal.js";
import { renderUserManagement } from "./pages/admin-users.js";
import { renderAlbum } from "./pages/album.js";
import { renderArtist } from "./pages/artist.js";
import { renderHome } from "./pages/home.js";
import { renderLibrary } from "./pages/library.js";
import { renderLogin } from "./pages/login.js";
import { renderPlaylist } from "./pages/playlist.js";
import { renderRadio } from "./pages/radio.js";
import { renderSettings } from "./pages/settings.js";
import { Player } from "./player/player.js"; // Ensure player is loaded

// Simple SPA Router
class Router {
  constructor() {
    this.routes = {};
    this.container = document.getElementById("main-content");
    this.navLinks = document.querySelectorAll(".nav-btn");

    window.addEventListener("hashchange", () => this.handleRoute());
  }

  add(path, renderFunction) {
    this.routes[path] = renderFunction;
  }

  async handleRoute() {
    const hash = window.location.hash || "#/";
    const path = hash.substring(1).split("?")[0];

    let matchedRoute = this.routes[path];
    let params = {};

    // Dynamic route matching (e.g. /artist/:id)
    if (!matchedRoute) {
      for (const routePath in this.routes) {
        if (routePath.includes(":")) {
          const routeParts = routePath.split("/");
          const pathParts = path.split("/");
          if (
            routeParts.length === pathParts.length &&
            routeParts[1] === pathParts[1]
          ) {
            matchedRoute = this.routes[routePath];
            params.id = pathParts[2];
            break;
          }
        }
      }
    }

    // Active link highlighting
    this.navLinks.forEach((link) => {
      const linkRoute = link.getAttribute("data-route");
      if (
        path === linkRoute ||
        (linkRoute !== "/" && path.startsWith(linkRoute))
      ) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    if (matchedRoute) {
      this.container.innerHTML =
        '<div class="page-loader"><div class="spinner"></div></div>';
      try {
        await matchedRoute(this.container, params);
        this.container.firstElementChild?.classList.add("fade-in");
      } catch (err) {
        console.error("Route render error:", err);
        this.container.innerHTML = `<div class="error-msg" style="padding: 20px; color: #ff5555;">Erreur de chargement de la page: ${err.message}</div>`;
      }
    } else {
      console.warn("Route not found:", path);
      this.container.innerHTML = "<h2>404 - Page non trouvée</h2>";
    }
  }
}

export const appRouter = new Router();

// Register Routes
appRouter.add("/", renderHome);
appRouter.add("/library", renderLibrary);
appRouter.add("/settings", renderSettings);
appRouter.add("/radio", renderRadio);
appRouter.add("/playlists", renderPlaylist);
appRouter.add("/artist/:id", renderArtist);
appRouter.add("/album/:id", renderAlbum);
appRouter.add("/login", renderLogin);
appRouter.add("/admin/users", renderUserManagement);

async function initApp() {
  console.log("Initializing MayWiFin...");
  try {
    // Check authentication
    const requireAuth = AppState.settings.require_auth === "1";
    const token = Api.getToken();

    if (requireAuth && !token) {
      window.location.hash = "#/login";
      return;
    }

    if (token) {
      try {
        AppState.user = await Api.getCurrentUser();
      } catch (err) {
        console.error("Failed to fetch current user", err);
        Api.setToken(null);
        if (requireAuth) {
          window.location.hash = "#/login";
          return;
        }
      }
    }

    // Fetch settings but don't block the UI if it fails
    Api.getSettings()
      .then((settings) => {
        AppState.settings = settings;
        if (settings.theme_accent) {
          document.documentElement.style.setProperty(
            "--accent",
            settings.theme_accent,
          );
        }
        console.log("Settings loaded.");
      })
      .catch((err) => {
        console.error("Failed to load settings from API", err);
      });

    // Always trigger initial route
    appRouter.handleRoute();

    // UI Event bindings (moved from individual scripts to ensure they exist)
    document.getElementById("close-panel")?.addEventListener("click", () => {
      document.getElementById("right-panel").classList.add("hidden");
    });

    document.getElementById("btn-lyrics")?.addEventListener("click", () => {
      const panel = document.getElementById("right-panel");
      document.getElementById("panel-title").textContent = "Paroles";
      panel.classList.toggle("hidden");
    });

    // Now playing modal on cover click
    document.getElementById("player-cover")?.addEventListener("click", () => {
      if (Player.currentTrack) {
        showNowPlayingModal(Player.currentTrack);
      }
    });
  } catch (err) {
    console.error("App fatal init error:", err);
    appRouter.handleRoute(); // Attempt to show something even if init fails
  }
}

// Start the app
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
