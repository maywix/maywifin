const db = require('../db/db');

let authCache = {
    token: null,
    userId: null,
    url: null,
    username: null,
    expiresAt: 0,
    failedUntil: 0,
    lastError: null
};

function normalizeJellyfinUrl(rawUrl) {
    if (!rawUrl) return '';
    let url = rawUrl.trim();

    // Fix malformed double protocol while preserving the first one
    // e.g. https://http://host:8096 -> https://host:8096
    url = url.replace(/^(https?):\/\/https?:\/\//i, '$1://');

    if (!/^https?:\/\//i.test(url)) {
        url = `http://${url}`;
    }

    return url;
}

function getJellyfinConfig() {
    const rawUrl = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_url'").get()?.value;
    const apiKey = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_apikey'").get()?.value;
    const userId = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_userid'").get()?.value;
    const username = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_username'").get()?.value;
    const password = db.prepare("SELECT value FROM settings WHERE key = 'source_jellyfin_password'").get()?.value;

    return {
        url: normalizeJellyfinUrl(rawUrl),
        apiKey,
        userId,
        username,
        password
    };
}

async function getJellyfinAuth(forceRefresh = false) {
    const { url, apiKey, userId, username, password } = getJellyfinConfig();

    if (!url) {
        throw new Error('Jellyfin URL missing');
    }

    // Legacy/fallback mode
    if (apiKey && userId) {
        return { url, token: apiKey, userId };
    }

    if (!username || !password) {
        throw new Error('Jellyfin credentials missing');
    }

    const now = Date.now();

    if (authCache.failedUntil > now) {
        throw new Error('Jellyfin login temporarily paused after failures. Retry in a few seconds.');
    }

    const sameIdentity =
        authCache.url === url &&
        authCache.username === username;

    if (!forceRefresh && sameIdentity && authCache.token && authCache.expiresAt > now) {
        return { url, token: authCache.token, userId: authCache.userId };
    }

    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const authRes = await fetch(`${baseUrl}/Users/AuthenticateByName`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Emby-Authorization': 'MediaBrowser Client="MayWiFin", Device="MayWiFin", DeviceId="maywifin_web", Version="1.0.0"'
        },
        body: JSON.stringify({
            Username: username,
            Pw: password,
            Password: password
        })
    });

    if (!authRes.ok) {
        authCache.failedUntil = now + 30000;
        authCache.lastError = `HTTP ${authRes.status}`;
        throw new Error('Jellyfin login failed (check URL/username/password)');
    }

    const authData = await authRes.json();
    authCache = {
        token: authData.AccessToken,
        userId: authData.User?.Id,
        url,
        username,
        expiresAt: now + 30 * 60 * 1000,
        failedUntil: 0,
        lastError: null
    };

    return { url, token: authCache.token, userId: authCache.userId };
}

module.exports = {
    normalizeJellyfinUrl,
    getJellyfinConfig,
    getJellyfinAuth
};
