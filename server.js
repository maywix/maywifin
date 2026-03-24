const express = require("express");
const cors = require("cors");
const path = require("path");

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Database init
const db = require("./db/db");

// Auto-scan logic
let autoScanInterval = null;
const fs = require("fs");

function scheduleAutoScan() {
  const interval =
    parseInt(
      db
        .prepare("SELECT value FROM settings WHERE key = 'auto_scan_interval'")
        .get()?.value,
    ) || 0;

  // Clear existing interval
  if (autoScanInterval) {
    clearInterval(autoScanInterval);
    autoScanInterval = null;
  }

  if (interval > 0) {
    console.log(`📅 Auto-scan scheduled every ${interval} seconds`);
    autoScanInterval = setInterval(async () => {
      console.log("🔄 Auto-scanning library...");
      const localPath = db
        .prepare("SELECT value FROM settings WHERE key = 'source_local'")
        .get()?.value;
      if (localPath && fs.existsSync(localPath)) {
        // Trigger library scan via API (simulated internal call)
        try {
          const libraryRouter = require("./routes/library");
          const library = await libraryRouter.performScan(localPath);
          console.log(
            `✅ Auto-scan complete. Found ${library.tracks ? library.tracks.length : 0} tracks.`,
          );
        } catch (err) {
          console.error("Auto-scan error:", err);
        }
      }
    }, interval * 1000);
  }
}

// Schedule auto-scan on startup
setTimeout(scheduleAutoScan, 2000);

// Check for auto-scan setting changes every minute
setInterval(() => {
  const currentInterval =
    parseInt(
      db
        .prepare("SELECT value FROM settings WHERE key = 'auto_scan_interval'")
        .get()?.value,
    ) || 0;
  const isScheduled = autoScanInterval !== null;

  if (
    (currentInterval > 0 && !isScheduled) ||
    (currentInterval === 0 && isScheduled)
  ) {
    scheduleAutoScan();
  }
}, 60000);

// Auth Routes (no protection - public)
app.use("/api/auth", require("./routes/auth"));

// Protected Routes (require auth if enabled)
const { verifyToken } = require("./routes/auth");
const authMiddleware = (req, res, next) => {
  const requireAuth = db
    .prepare("SELECT value FROM settings WHERE key = 'require_auth'")
    .get()?.value;
  if (requireAuth === "1") {
    verifyToken(req, res, next);
  } else {
    next();
  }
};

// API Routes
app.use("/api/settings", require("./routes/settings"));
app.use("/api/lyrics", require("./routes/lyrics"));
app.use("/api/library", require("./routes/library"));
app.use("/api/jellyfin", require("./routes/jellyfin"));
app.use("/api/stream", require("./routes/stream"));
app.use("/api/playcount", authMiddleware, require("./routes/playcount"));
app.use("/api/playback", require("./routes/playback"));

// Serve frontend for any other route (SPA fallback)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start Server
app.listen(PORT, () => {
  console.log(`🎵 MayWiFin server is running on port ${PORT}`);
});
