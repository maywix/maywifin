const express = require("express");
const router = express.Router();
const { execFile } = require("child_process");
const db = require("../db/db");
const { verifyToken, requireAdmin } = require("./auth");

// Settings that must never be echoed back to the client in plaintext.
const SENSITIVE_KEYS = new Set(["source_jellyfin_password", "source_jellyfin_apikey"]);

// Get all settings (sensitive values redacted - the frontend only needs to know "is it set")
router.get("/", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM settings").all();
    const settings = {};
    rows.forEach((row) => {
      if (SENSITIVE_KEYS.has(row.key)) {
        settings[`${row.key}_set`] = Boolean(row.value);
      } else {
        settings[row.key] = row.value;
      }
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a setting (always admin-only, even when require_auth is disabled -
// writing credentials/paths should never be reachable by an anonymous visitor).
router.post("/", verifyToken, requireAdmin, (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: "Missing key" });

  try {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, value || "");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check whether ffmpeg is installed and reachable (used by the admin transcoding tab).
router.get("/ffmpeg-status", verifyToken, requireAdmin, (req, res) => {
  execFile("ffmpeg", ["-version"], (err, stdout) => {
    if (err) {
      return res.json({ available: false, error: err.message });
    }
    const versionLine = stdout.split("\n")[0] || "";
    res.json({ available: true, version: versionLine });
  });
});

module.exports = router;
