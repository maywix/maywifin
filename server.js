const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database init
const db = require('./db/db');

// API Routes
app.use('/api/settings', require('./routes/settings'));
app.use('/api/playcount', require('./routes/playcount'));
app.use('/api/lyrics', require('./routes/lyrics'));
app.use('/api/library', require('./routes/library'));
app.use('/api/jellyfin', require('./routes/jellyfin'));
app.use('/api/stream', require('./routes/stream'));

// Serve frontend for any other route (SPA fallback)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`🎵 MayWiFin server is running on port ${PORT}`);
});
