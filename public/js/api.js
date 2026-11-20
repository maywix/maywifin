// API Client Helper
const BASE_URL = "/api";

export const AppState = {
  settings: {},
  library: { artists: {}, albums: {}, tracks: [] },
  jellyfin: { artists: [], albums: [], tracks: [] },
  user: null,
  queue: [],
  history: [],
};

export const Api = {
  // Token management
  getToken: () => localStorage.getItem("auth_token"),
  setToken: (token) => {
    if (token) localStorage.setItem("auth_token", token);
    else localStorage.removeItem("auth_token");
  },

  // For URLs loaded by native <audio>/<img> elements, which can't send a custom
  // Authorization header - the backend also accepts the token as ?token=... for
  // exactly this reason. No-op (returns the url unchanged) when auth isn't required.
  withAuth: (url) => {
    const token = Api.getToken();
    if (!token) return url;
    return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  },

  async request(endpoint, options = {}) {
    try {
      const token = Api.getToken();
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
          ...options.headers,
        },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `API Error: ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`Failed fetching ${endpoint}:`, err);
      throw err;
    }
  },

  // Settings
  getSettings: () => Api.request("/settings"),
  saveSetting: (key, value) =>
    Api.request("/settings", {
      method: "POST",
      body: JSON.stringify({ key, value }),
    }),

  // Library
  getLibraryStatus: () => Api.request("/library/status"),
  scanLibrary: () => Api.request("/library/scan", { method: "POST" }),
  getLocalLibrary: () => Api.request("/library"),
  getLibraryStats: () => Api.request("/library/stats"),
  getWaveform: (trackId) => Api.request(`/library/waveform/${trackId}`),
  // Uploads a single file (the UploadManager handles batching/concurrency and calls
  // this once per file, with autoScan disabled so it can trigger one scan for the
  // whole batch itself instead of one per file).
  uploadTrack: async (file, onProgress, { autoScan = false } = {}) => {
    const formData = new FormData();
    formData.append("files", file);
    formData.append("autoScan", autoScan ? "true" : "false");

    const tag = `[upload:${file.name}]`;
    console.log(tag, "starting, size:", file.size);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE_URL}/library/upload`);
      const token = Api.getToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      // Belt-and-suspenders against a connection that goes silently dead mid-transfer
      // (confirmed to happen on real uploads even though the server itself responds
      // instantly): a hard cap, AND a stall watchdog that fires much sooner if no new
      // bytes have gone out for a while, so a dead connection is detected in seconds
      // instead of after the full 30-minute cap.
      xhr.timeout = 30 * 60 * 1000;

      const STALL_MS = 20000;
      let stallTimer = null;
      let settled = false;

      const clearStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer);
      };

      const armStallTimer = () => {
        clearStallTimer();
        stallTimer = setTimeout(() => {
          if (settled) return;
          console.error(tag, `no progress for ${STALL_MS / 1000}s - aborting as stalled`);
          xhr.abort();
        }, STALL_MS);
      };

      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        clearStallTimer();
        fn(arg);
      };

      armStallTimer(); // covers the initial connect phase too, before any progress event

      xhr.upload.addEventListener("progress", (e) => {
        console.log(tag, "upload progress", e.loaded, "/", e.total, "computable:", e.lengthComputable);
        armStallTimer();
        if (onProgress && e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        console.log(tag, "load event, status:", xhr.status);
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (_e) {}
        if (xhr.status >= 200 && xhr.status < 300) finish(resolve, data);
        else finish(reject, new Error(data.error || `Upload failed: ${xhr.statusText}`));
      });

      xhr.addEventListener("error", () => {
        console.error(tag, "xhr error event");
        finish(reject, new Error("Erreur réseau pendant l'upload"));
      });
      xhr.addEventListener("timeout", () => {
        console.error(tag, "xhr timeout event (30 min elapsed)");
        finish(reject, new Error("Upload expiré (connexion trop lente ou interrompue)"));
      });
      xhr.addEventListener("abort", () => {
        console.warn(tag, "xhr abort event");
        finish(reject, new Error("STALLED"));
      });
      xhr.send(formData);
    });
  },

  // Streaming quality
  getStreamTiers: (trackId, tier) =>
    Api.request(`/stream/${trackId}/tiers${tier ? `?tier=${tier}` : ''}`),

  // Admin
  getFfmpegStatus: () => Api.request("/settings/ffmpeg-status"),

  // Jellyfin
  getJellyfinArtists: () => Api.request("/jellyfin/artists"),
  getJellyfinAlbums: (artistId) =>
    Api.request(
      artistId ? `/jellyfin/albums?artistId=${artistId}` : "/jellyfin/albums",
    ),
  getJellyfinTracks: (albumId) =>
    Api.request(
      albumId ? `/jellyfin/tracks?albumId=${albumId}` : "/jellyfin/tracks",
    ),
  connectJellyfin: () => Api.request('/jellyfin/connect', { method: 'POST' }),
  scanJellyfinLibrary: () => Api.request('/jellyfin/scan', { method: 'POST' }),

  // Playcount
  recordPlay: (track) =>
    Api.request(`/playcount/${track.id}`, {
      method: "POST",
      body: JSON.stringify({
        title: track.title,
        artist: track.artist,
        album: track.album || "",
      }),
    }),
  getTopPlayed: (limit = 20) => Api.request(`/playcount/top?limit=${limit}`),
  getTopByArtist: (artist, limit = 10) =>
    Api.request(
      `/playcount/top/artist?artist=${encodeURIComponent(artist)}&limit=${limit}`,
    ),

  // Lyrics
  getLyrics: (trackName, artistName, albumName, duration) => {
    const query = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });
    if (albumName) query.append("album_name", albumName);
    if (duration) query.append("duration", duration);
    return Api.request(`/lyrics?${query.toString()}`);
  },

  // Auth
  register: (username, password) =>
    Api.request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username, password) =>
    Api.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  getCurrentUser: () => Api.request("/auth/me"),
  getAuthPublicStatus: () => Api.request("/auth/public-status"),
  logout: () => Api.setToken(null),
  getUsers: () => Api.request("/auth/users"),
  setUserAdmin: (userId, isAdmin) =>
    Api.request(`/auth/users/${userId}/admin`, {
      method: "POST",
      body: JSON.stringify({ is_admin: isAdmin }),
    }),
  deleteUser: (userId) =>
    Api.request(`/auth/users/${userId}`, { method: "DELETE" }),

  // Playback Queue
  getQueue: () => Api.request("/playback/queue"),
  addToQueue: (trackId) =>
    Api.request("/playback/queue", {
      method: "POST",
      body: JSON.stringify({ track_id: trackId }),
    }),
  removeFromQueue: (id) =>
    Api.request(`/playback/queue/${id}`, { method: "DELETE" }),
  clearQueue: () => Api.request("/playback/queue", { method: "DELETE" }),

  // Playback History
  getHistory: (limit = 50) => Api.request(`/playback/history?limit=${limit}`),
  recordPlayback: (trackId) =>
    Api.request("/playback/history", {
      method: "POST",
      body: JSON.stringify({ track_id: trackId }),
    }),
  clearHistory: () => Api.request("/playback/history", { method: "DELETE" }),
};
