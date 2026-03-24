const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'maywifin.sqlite'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Initialize Schema
db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    CREATE TABLE IF NOT EXISTS play_counts (
        id TEXT PRIMARY KEY, -- Can be local path or Jellyfin ID
        title TEXT,
        artist TEXT,
        album TEXT,
        count INTEGER DEFAULT 0,
        last_played DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT No NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id INTEGER,
        track_id TEXT, -- local path or Jellyfin ID
        sort_order INTEGER,
        FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
`);

// Seed default settings if empty
const checkSettings = db.prepare("SELECT count(*) as count FROM settings").get();
if (checkSettings.count === 0) {
    const defaultSettings = [
        ['source_local', ''],
        ['source_jellyfin_url', ''],
        ['source_jellyfin_apikey', ''],
        ['source_jellyfin_userid', ''],
        ['theme_accent', '#ffffff'],
        ['player_crossfade', '0']
    ];
    
    const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    db.transaction(() => {
        for (const [k, v] of defaultSettings) {
            insertSetting.run(k, v);
        }
    })();
}

module.exports = db;
