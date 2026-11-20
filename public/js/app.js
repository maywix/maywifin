import { Api, AppState } from "./api.js";
import { showNowPlayingModal } from "./components/nowplaying-modal.js";
import { showFxModal } from "./components/fx-modal.js";
import { mountUploadIndicator } from "./components/upload-indicator.js";
import { setCurrentQuality } from "./player/quality-menu.js";
import { renderAlbum } from "./pages/album.js";
import { renderArtist } from "./pages/artist.js";
import { renderHome } from "./pages/home.js";
import { renderLibrary } from "./pages/library.js";
import { renderPlaylist } from "./pages/playlist.js";
import { renderRadio } from "./pages/radio.js";
import { renderSettings } from "./pages/settings.js";
import { renderLogin } from "./pages/login.js";
import { renderAdmin } from "./pages/admin.js";
import { Player } from "./player/player.js"; // Ensure player is loaded

function startRouteProgress() {
  const bar = document.getElementById("route-progress");
  if (!bar) return;
  bar.style.transition = "none";
  bar.style.width = "0%";
  bar.style.opacity = "1";
  void bar.offsetWidth; // force reflow so the transition below actually animates from 0
  bar.style.transition = "width 0.35s ease";
  bar.style.width = "70%";
}

function finishRouteProgress() {
  const bar = document.getElementById("route-progress");
  if (!bar) return;
  bar.style.transition = "width 0.2s ease";
  bar.style.width = "100%";
  setTimeout(() => {
    bar.style.transition = "opacity 0.3s ease";
    bar.style.opacity = "0";
  }, 180);
}

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

    // Auth guard: redirect to login if the server requires it and we have no session.
    if (AppState.requireAuth && !AppState.user && path !== "/login") {
      if (window.location.hash !== "#/login") {
        window.location.hash = "#/login";
      }
      return;
    }

    if (matchedRoute) {
      // Remember where we are so a reload (or reopening the app later, without a hash
      // in the URL) lands back here instead of always resetting to Home.
      if (path !== "/login") {
        try {
          localStorage.setItem("maywifin_last_route", hash);
        } catch (err) {
          // Not fatal - just means the "come back to the same page" part won't work.
        }
      }

      // No blanket loader here: the previous page stays visible (no blank/reload flash)
      // while the new one renders. Individual pages show their own loader only when
      // they genuinely need to wait on a network fetch with no cached data yet.
      startRouteProgress();

      const doRender = async () => {
        try {
          await matchedRoute(this.container, params);
        } catch (err) {
          console.error("Route render error:", err);
          this.container.innerHTML = `<div class="error-msg" style="padding: 20px; color: #ff5555;">Erreur de chargement de la page: ${err.message}</div>`;
        }
      };

      try {
        // Native browser-level crossfade between the old and new page content - this is
        // what actually kills the "feels like a reload" flash on every navigation, since
        // the outgoing content stays visible (smoothly fading) instead of popping away.
        // Chrome/Edge support this today; Safari/Firefox just skip straight to doRender()
        // and fall back to the plain fade-in below - no error, no broken behavior either way.
        if (document.startViewTransition) {
          const transition = document.startViewTransition(doRender);
          await transition.finished;
        } else {
          await doRender();
          this.container.firstElementChild?.classList.add("fade-in");
        }
      } finally {
        finishRouteProgress();
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
appRouter.add("/admin", renderAdmin);
appRouter.add("/admin/:tab", renderAdmin);

async function initApp() {
  console.log("Initializing MayWiFin...");
  try {
    // Load settings first (required to know auth mode)
    try {
      const settings = await Api.getSettings();
      AppState.settings = settings;
      if (settings.theme_accent) {
        document.documentElement.style.setProperty(
          "--accent",
          settings.theme_accent,
        );
      }
      if (settings.transcode_default_tier) {
        setCurrentQuality(settings.transcode_default_tier);
      }
      console.log("Settings loaded.");
    } catch (err) {
      console.error("Failed to load settings from API", err);
    }

    // Determine whether a session is required, and resolve the current user if we have a token.
    AppState.requireAuth = AppState.settings.require_auth === "1";

    if (Api.getToken()) {
      try {
        AppState.user = await Api.getCurrentUser();
      } catch (err) {
        // Stale/invalid token
        Api.setToken(null);
        AppState.user = null;
      }
    }

    // Show the Admin nav item only for logged-in admins.
    const adminNav = document.getElementById("nav-admin");
    if (adminNav) adminNav.style.display = AppState.user?.is_admin ? "" : "none";

    // Background upload progress pill, visible on every page.
    mountUploadIndicator();

    // Resume whatever was playing before the last reload, at the same timecode -
    // requires a resolved session so the stream request carries a valid token.
    if (!AppState.requireAuth || AppState.user) {
      Player.restoreState();
    }

    // If the URL doesn't already point at a page (a reload keeps its hash on its own -
    // this is for a bare bookmark/URL with no hash at all), pick up on whichever page
    // was last visited instead of always landing back on Home.
    if (!window.location.hash || window.location.hash === "#" || window.location.hash === "#/") {
      try {
        const lastRoute = localStorage.getItem("maywifin_last_route");
        if (lastRoute && lastRoute !== "#/") {
          window.location.hash = lastRoute;
        }
      } catch (err) {
        // Not fatal - just falls back to Home.
      }
    }

    // Always trigger initial route
    appRouter.handleRoute();

    // Same idea for the lyrics panel: reopen it if it was left open, now that
    // Player.restoreState() above has already repopulated its content.
    try {
      if (localStorage.getItem("maywifin_lyrics_open") === "1") {
        document.getElementById("panel-title").textContent = "Paroles";
        document.getElementById("right-panel").classList.remove("hidden");
      }
    } catch (err) {
      // Not fatal - the panel just starts closed.
    }

    // UI Event bindings (moved from individual scripts to ensure they exist)
    document.getElementById("close-panel")?.addEventListener("click", () => {
      document.getElementById("right-panel").classList.add("hidden");
      try {
        localStorage.setItem("maywifin_lyrics_open", "0");
      } catch (err) {}
    });

    document.getElementById("btn-lyrics")?.addEventListener("click", () => {
      const panel = document.getElementById("right-panel");
      document.getElementById("panel-title").textContent = "Paroles";
      panel.classList.toggle("hidden");
      try {
        localStorage.setItem("maywifin_lyrics_open", panel.classList.contains("hidden") ? "0" : "1");
      } catch (err) {}
    });

    document.getElementById("btn-fx")?.addEventListener("click", () => {
      showFxModal();
    });

    // Now playing modal - opens from anywhere on the cover/track-info area (not just the
    // cover itself), since that's the only reliable tap target once the mobile player bar
    // hides its secondary controls (see main.css's mobile breakpoints). The artist name
    // stays a real link to the artist page instead of opening the modal.
    document.querySelector(".now-playing")?.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      if (Player.currentTrack) {
        showNowPlayingModal(Player.currentTrack);
      }
    });

    // Keyboard shortcuts - space to play/pause, arrows to seek/volume. Ignored while
    // typing in a field (search, settings, login...) so it doesn't hijack normal typing.
    // The seek bar is the exception: it's a slider, not a text field, and after clicking it
    // the shortcuts used to go dead (space did nothing, arrows nudged it by a fraction of a
    // percent) until you clicked somewhere else. Here arrows seek by 5s like everywhere else.
    document.addEventListener("keydown", (e) => {
      const active = document.activeElement;
      const isSeekBar = active?.classList.contains("seek-bar");
      if (!isSeekBar && (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA" || active?.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          Player.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          Player.seekBy(-5);
          break;
        case "ArrowRight":
          e.preventDefault();
          Player.seekBy(5);
          break;
        case "ArrowUp": {
          e.preventDefault();
          const volBar = document.getElementById("volume-bar");
          volBar.value = Math.min(100, parseFloat(volBar.value) + 5);
          volBar.dispatchEvent(new Event("input"));
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const volBar = document.getElementById("volume-bar");
          volBar.value = Math.max(0, parseFloat(volBar.value) - 5);
          volBar.dispatchEvent(new Event("input"));
          break;
        }
        default:
          if (e.key === "n" || e.key === "N") { Player.playNext(); }
          if (e.key === "p" || e.key === "P") { Player.playPrev(); }
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
