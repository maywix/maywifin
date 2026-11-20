// Shared helpers for building a MayWiFin-shaped {artists, albums, tracks} structure out
// of Jellyfin's raw /Items response - was duplicated near-identically across
// library.js/album.js/artist.js, now centralized here.
import { Api } from './api.js';

export function normalizeJellyfinTracks(raw) {
    const items = Array.isArray(raw) ? raw : (raw.Items || []);
    return items.map((item) => ({
        id: item.Id,
        type: 'jellyfin',
        title: item.Name || 'Unknown Title',
        artist: (item.Artists && item.Artists[0]) || item.AlbumArtist || 'Unknown Artist',
        album: item.Album || 'Unknown Album',
        track_no: item.IndexNumber || null,
        duration: item.RunTimeTicks ? item.RunTimeTicks / 10000000 : 0,
        albumId: item.AlbumId || item.Id
    }));
}

export function buildLibraryFromTracks(tracks) {
    const artists = {};
    const albums = {};

    tracks.forEach((track) => {
        if (!artists[track.artist]) {
            artists[track.artist] = { name: track.artist, albums: new Set() };
        }
        artists[track.artist].albums.add(track.album);

        if (!albums[track.album]) {
            albums[track.album] = { name: track.album, artist: track.artist, tracks: [] };
        }
        albums[track.album].tracks.push(track.id);
    });

    Object.keys(artists).forEach((artist) => {
        artists[artist].albums = Array.from(artists[artist].albums);
    });

    return { artists, albums, tracks };
}

export async function loadJellyfinLibrary() {
    const raw = await Api.getJellyfinTracks();
    return buildLibraryFromTracks(normalizeJellyfinTracks(raw));
}
