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
