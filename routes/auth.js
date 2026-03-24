const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/db');

// Hash password with salt
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha256').toString('hex');
    return `${salt}:${hash}`;
}

// Verify password
function verifyPassword(password, hashWithSalt) {
    const [salt, hash] = hashWithSalt.split(':');
    const verify = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha256').toString('hex');
    return verify === hash;
}

// Generate JWT
function generateToken(userId) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ 
        userId, 
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', process.env.JWT_SECRET || 'your-secret-key').update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
}

// Middleware to verify JWT
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    try {
        const [header, payload, signature] = token.split('.');
        const verify = crypto.createHmac('sha256', process.env.JWT_SECRET || 'your-secret-key').update(`${header}.${payload}`).digest('base64url');
        
        if (verify !== signature) throw new Error("Invalid signature");
        
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (decoded.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
        
        req.userId = decoded.userId;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
}

// Public status for login UI
router.get('/public-status', (req, res) => {
    try {
        const usersCount = db.prepare("SELECT count(*) as count FROM users").get().count;
        const requireAuth = db.prepare("SELECT value FROM settings WHERE key = 'require_auth'").get()?.value === '1';
        res.json({
            usersCount,
            hasUsers: usersCount > 0,
            allowPublicRegistration: usersCount === 0,
            requireAuth
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register
router.post('/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    try {
        const totalUsers = db.prepare("SELECT count(*) as count FROM users").get().count;

        // If users already exist, registration is admin-only
        if (totalUsers > 0) {
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                return res.status(403).json({ error: "Admin required to create additional users" });
            }

            const [header, payload, signature] = token.split('.');
            const verify = crypto.createHmac('sha256', process.env.JWT_SECRET || 'your-secret-key').update(`${header}.${payload}`).digest('base64url');
            if (verify !== signature) {
                return res.status(401).json({ error: "Invalid token" });
            }

            const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
            if (decoded.exp < Math.floor(Date.now() / 1000)) {
                return res.status(401).json({ error: "Token expired" });
            }

            const creator = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(decoded.userId);
            if (!creator?.is_admin) {
                return res.status(403).json({ error: "Admin required to create additional users" });
            }
        }

        // Check if user already exists
        const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
        if (existing) {
            return res.status(400).json({ error: "Username already exists" });
        }

        const passwordHash = hashPassword(password);
        const result = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, passwordHash);
        
        const token = generateToken(result.lastInsertRowid);
        res.json({ 
            success: true, 
            token,
            user: {
                id: result.lastInsertRowid,
                username,
                is_admin: 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
    }

    try {
        const user = db.prepare("SELECT id, username, password_hash, is_admin FROM users WHERE username = ?").get(username);
        
        if (!user || !verifyPassword(password, user.password_hash)) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = generateToken(user.id);
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                is_admin: user.is_admin
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get current user
router.get('/me', verifyToken, (req, res) => {
    try {
        const user = db.prepare("SELECT id, username, is_admin FROM users WHERE id = ?").get(req.userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// List all users (admin only)
router.get('/users', verifyToken, (req, res) => {
    try {
        const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.userId);
        if (!user?.is_admin) return res.status(403).json({ error: "Admin only" });

        const users = db.prepare("SELECT id, username, is_admin, created_at FROM users").all();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user role (admin only)
router.post('/users/:userId/admin', verifyToken, (req, res) => {
    const { is_admin } = req.body;
    
    try {
        const admin = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.userId);
        if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

        db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(is_admin ? 1 : 0, req.params.userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete user (admin only)
router.delete('/users/:userId', verifyToken, (req, res) => {
    try {
        const admin = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.userId);
        if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

        db.prepare("DELETE FROM users WHERE id = ?").run(req.params.userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
module.exports.verifyToken = verifyToken;
