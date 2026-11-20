const express = require("express");
const cors = require("cors");
const path = require("path");

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Defense in depth: one bad request (e.g. a stream/socket edge case during rapid
// seeking) should never take down playback for everyone else on this server. Node's
// default behavior for an uncaught exception or unhandled rejection is to crash the
// whole process - log it and keep running instead.
process.on("uncaughtException", (err) => {
  console.error("⚠️ Uncaught exception (server stays up):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Unhandled promise rejection (server stays up):", reason);
});

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

// Auth Routes (no protection - public, must stay reachable to log in)
const { verifyToken } = require("./routes/auth");
app.use("/api/auth", require("./routes/auth"));

// Gate: only enforce a valid session when require_auth=1 (the default).
// When require_auth=0, behaves like the previous no-op middleware (fully open).
function authMiddleware(req, res, next) {
  const requireAuth = db
    .prepare("SELECT value FROM settings WHERE key = 'require_auth'")
    .get()?.value;

  if (requireAuth !== "1") return next();
  return verifyToken(req, res, next);
}

// API Routes
// /api/settings stays reachable without a session (the frontend needs GET /settings,
// including require_auth itself, to decide whether to show the login screen before any
// user is authenticated). This is safe: routes/settings.js redacts sensitive values from
// GET and requires verifyToken+requireAdmin on POST regardless of this mount-level gate.
app.use("/api/settings", require("./routes/settings"));
app.use("/api/lyrics", authMiddleware, require("./routes/lyrics"));
app.use("/api/library", authMiddleware, require("./routes/library"));
app.use("/api/jellyfin", authMiddleware, require("./routes/jellyfin"));
app.use("/api/stream", authMiddleware, require("./routes/stream"));
app.use("/api/playcount", authMiddleware, require("./routes/playcount"));
app.use("/api/playback", authMiddleware, require("./routes/playback"));

// Serve frontend for any other route (SPA fallback)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start Server
const httpServer = app.listen(PORT, () => {
  console.log(`🎵 MayWiFin server is running on port ${PORT}`);
});

// Node's default request timeout (5 min) can kill large hi-res/Atmos file uploads
// mid-transfer on a slow disk or connection - disable it. Headers timeout stays at
// its default since headers always arrive quickly regardless of file size.
httpServer.requestTimeout = 0;
