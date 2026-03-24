# 🎵 MayWiFin

> Self-hosted web music player for Linux VM / Proxmox — inspired by Jellyfin & Symfonium.

## Features

- 📂 Local folder scan or Jellyfin API integration
- 🎨 Dark mode with custom accent color + album art blur backdrop
- 🎤 Synced lyrics via LRCLIB (LRC format)
- 🎛️ Audio effects: Pitch shift (slowed), Reverb, Bass boost
- 🔀 Configurable crossfade between tracks
- 🎙️ Artist pages with Albums + Singles, sortable by date
- 📋 Smart playlists (sort by name, album, artist, or "artistic" order)
- 📻 Genre-based 24/7 radio stations
- 📊 Most played tracks (global + per artist)
- ⚙️ Extensive settings & customization

## Stack

- **Backend**: Node.js + Express + SQLite
- **Frontend**: Vanilla JS SPA + Web Audio API
- **Lyrics**: LRCLIB public API

## Getting Started

```bash
npm install
node server.js
# Open http://localhost:3000
```

Configure your music source (local path or Jellyfin) in **Settings**.

## License

MIT
