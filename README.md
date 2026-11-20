# 🎵 MayWiFin

> Self-hosted web music player for Linux VM / Proxmox — inspired by Jellyfin & Symfonium.

## Features

- 📂 Local folder scan or Jellyfin API integration
- 🎨 Dark mode with custom accent color + album art blur backdrop
- 🎤 Synced lyrics via LRCLIB (LRC format)
- 🎛️ Audio effects: Pitch shift (slowed), Reverb, Bass boost — precise per-session controls via the FX popup
- 🔀 Configurable crossfade between tracks
- 🎙️ Artist pages with Albums + Singles, sortable by date
- 📋 Smart playlists (sort by name, album, artist, or "artistic" order)
- 📻 Genre-based 24/7 radio stations
- 📊 Most played tracks (global + per artist)
- ⚙️ Extensive settings & customization
- 🎧 Universal format detection (FLAC/ALAC/APE/WavPack/PCM/MP3/AAC/Ogg/Opus/WMA, best-effort Dolby Atmos/multichannel flagging)
- 🎚️ Quality-tiered streaming (Hi-Res Lossless / Lossless / MP3 320 / MP3 128) with live ffmpeg transcoding — never upscales a source
- 🛠️ Dedicated **Admin** page (Sources, Library stats, Transcoding, Users) — admin account required

## Stack

- **Backend**: Node.js + Express + better-sqlite3
- **Frontend**: Vanilla JS SPA + Web Audio API
- **Lyrics**: LRCLIB public API
- **Transcoding**: ffmpeg/ffprobe (must be installed on the host, or present in the Docker image — already included in `Dockerfile`)

## Getting Started

```bash
npm install
node server.js
# Open http://localhost:3000
```

A default admin account is created on first run (`admin` / `admin123`, override via `DEFAULT_ADMIN_USER` / `DEFAULT_ADMIN_PASSWORD` env vars) — log in and change the password, then configure your music source (local path or Jellyfin) and transcoding options from the **Admin** page.

## License

MIT
