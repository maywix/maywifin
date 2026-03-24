const express = require("express");
const router = express.Router();
const db = require("../db/db");
const { verifyToken } = require("./auth");

// Get playback queue for current user
router.get("/queue", verifyToken, (req, res) => {
  try {
    const queue = db
      .prepare(
        "SELECT * FROM playback_queue WHERE user_id = ? ORDER BY position",
      )
      .all(req.userId);
    res.json(queue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add track to queue
router.post("/queue", verifyToken, (req, res) => {
  const { track_id } = req.body;

  if (!track_id) {
    return res.status(400).json({ error: "track_id required" });
  }

  try {
    // Get next position
    const lastItem = db
      .prepare(
        "SELECT MAX(position) as maxPos FROM playback_queue WHERE user_id = ?",
      )
      .get(req.userId);
    const nextPos = (lastItem.maxPos || 0) + 1;

    const result = db
      .prepare(
        "INSERT INTO playback_queue (user_id, track_id, position) VALUES (?, ?, ?)",
      )
      .run(req.userId, track_id, nextPos);

    res.json({
      success: true,
      id: result.lastInsertRowid,
      position: nextPos,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear queue
router.delete("/queue", verifyToken, (req, res) => {
  try {
    db.prepare("DELETE FROM playback_queue WHERE user_id = ?").run(req.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove from queue
router.delete("/queue/:id", verifyToken, (req, res) => {
  try {
    db.prepare("DELETE FROM playback_queue WHERE id = ? AND user_id = ?").run(
      req.params.id,
      req.userId,
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Record track play to history
router.post("/history", verifyToken, (req, res) => {
  const { track_id } = req.body;

  if (!track_id) {
    return res.status(400).json({ error: "track_id required" });
  }

  try {
    db.prepare(
      "INSERT INTO playback_history (user_id, track_id) VALUES (?, ?)",
    ).run(req.userId, track_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get playback history for current user
router.get("/history", verifyToken, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  try {
    const history = db
      .prepare(
        "SELECT * FROM playback_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?",
      )
      .all(req.userId, limit);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear history
router.delete("/history", verifyToken, (req, res) => {
  try {
    db.prepare("DELETE FROM playback_history WHERE user_id = ?").run(
      req.userId,
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
