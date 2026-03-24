const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Ensure db directory exists
const dbDir = path.join(__dirname, "..", "db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.join(dbDir, "maywifin.sqlite"));

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

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
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id INTEGER,
        track_id TEXT, -- local path or Jellyfin ID
        sort_order INTEGER,
        FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS playback_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            track_id TEXT NOT NULL,
            position INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS playback_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            track_id TEXT NOT NULL,
            played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
`);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha256")
    .toString("hex");
  return `${salt}:${hash}`;
}

// Ensure default settings exist (also for upgraded installations)
const defaultSettings = [
  ["source_local", ""],
  ["source_jellyfin_url", ""],
  ["source_jellyfin_apikey", ""],
  ["source_jellyfin_userid", ""],
  ["theme_accent", "#ffffff"],
  ["player_crossfade", "0"],
  ["auto_scan_interval", "0"],
  ["require_auth", "1"],
];

const upsertSetting = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
);

db.transaction(() => {
  for (const [k, v] of defaultSettings) {
    upsertSetting.run(k, v);
  }
})();

// Bootstrap default admin if no users exist
const usersCount = db.prepare("SELECT count(*) as count FROM users").get().count;
if (usersCount === 0) {
  const defaultAdminUser = process.env.DEFAULT_ADMIN_USER || "admin";
  const defaultAdminPass = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";
  const passwordHash = hashPassword(defaultAdminPass);

  db.prepare(
    "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
  ).run(defaultAdminUser, passwordHash);

  db.prepare(
    "UPDATE settings SET value = '1' WHERE key = 'require_auth'",
  ).run();

  console.log(
    `🔐 Default admin created -> username: ${defaultAdminUser} | password: ${defaultAdminPass}`,
  );
}

module.exports = db;
