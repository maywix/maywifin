// API Client Helper
const BASE_URL = '/api';

export const AppState = {
    settings: {},
    library: { artists: {}, albums: {}, tracks: [] },
    jellyfin: { artists: [], albums: [], tracks: [] }
};

export const Api = {
    async request(endpoint, options = {}) {
        try {
            const res = await fetch(`${BASE_URL}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
            return await res.json();
        } catch (err) {
            console.error(`Failed fetching ${endpoint}:`, err);
            throw err;
        }
    },

    // Settings
    getSettings: () => Api.request('/settings'),
    saveSetting: (key, value) => Api.request('/settings', { method: 'POST', body: JSON.stringify({ key, value }) }),

    // Library
    getLibraryStatus: () => Api.request('/library/status'),
    scanLibrary: () => Api.request('/library/scan', { method: 'POST' }),
    getLocalLibrary: () => Api.request('/library'),

    // Jellyfin
    getJellyfinArtists: () => Api.request('/jellyfin/artists'),
    getJellyfinAlbums: (artistId) => Api.request(artistId ? `/jellyfin/albums?artistId=${artistId}` : '/jellyfin/albums'),
    getJellyfinTracks: (albumId) => Api.request(albumId ? `/jellyfin/tracks?albumId=${albumId}` : '/jellyfin/tracks'),

    // Playcount
    recordPlay: (track) => Api.request(`/playcount/${track.id}`, { 
        method: 'POST', 
        body: JSON.stringify({ title: track.title, artist: track.artist, album: track.album || '' })
    }),
    getTopPlayed: (limit = 20) => Api.request(`/playcount/top?limit=${limit}`),
    getTopByArtist: (artist, limit = 10) => Api.request(`/playcount/top/artist?artist=${encodeURIComponent(artist)}&limit=${limit}`),

    // Lyrics
    getLyrics: (trackName, artistName, albumName, duration) => {
        const query = new URLSearchParams({ track_name: trackName, artist_name: artistName });
        if (albumName) query.append('album_name', albumName);
        if (duration) query.append('duration', duration);
        return Api.request(`/lyrics?${query.toString()}`);
    }
};
