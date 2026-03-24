import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, 'cache.db');

let _db = null;

export function getDb() {
    if (!_db) {
        _db = new Database(CACHE_FILE);
        _db.exec(`
            CREATE TABLE IF NOT EXISTS cache (
                key TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                value TEXT NOT NULL,
                cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_cached_at ON cache(cached_at);
            CREATE INDEX IF NOT EXISTS idx_type ON cache(type);
        `);
    }
    return _db;
}

export const SqliteCache = {
    // Feed cache
    getFeed(url) {
        const db = getDb();
        const row = db.prepare('SELECT value, cached_at FROM cache WHERE key = ? AND type = ?').get(url, 'feed');
        if (row) return JSON.parse(row.value);
        return null;
    },

    setFeed(url, items) {
        const db = getDb();
        db.prepare('INSERT OR REPLACE INTO cache (key, type, value, cached_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
            .run(url, 'feed', JSON.stringify({ timestamp: new Date().toISOString(), items }));
    },

    // Inference cache (title hash -> sentiment result)
    getInference(hash) {
        const db = getDb();
        const row = db.prepare('SELECT value FROM cache WHERE key = ? AND type = ?').get(hash, 'inference');
        if (row) return JSON.parse(row.value);
        return null;
    },

    setInference(hash, result) {
        const db = getDb();
        db.prepare('INSERT OR REPLACE INTO cache (key, type, value, cached_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
            .run(hash, 'inference', JSON.stringify(result));
    },

    // Embedding cache (title hash -> embedding vector)
    getEmbedding(hash) {
        const db = getDb();
        const row = db.prepare('SELECT value FROM cache WHERE key = ? AND type = ?').get(hash, 'embedding');
        if (row) return JSON.parse(row.value);
        return null;
    },

    setEmbedding(hash, vector) {
        const db = getDb();
        db.prepare('INSERT OR REPLACE INTO cache (key, type, value, cached_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
            .run(hash, 'embedding', JSON.stringify(vector));
    },

    // Evict entries older than maxAgeMs
    prune(maxAgeMs = 24 * 60 * 60 * 1000) {
        const db = getDb();
        const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
        const result = db.prepare('DELETE FROM cache WHERE cached_at < ?').run(cutoff);
        console.log(`Cache pruned: ${result.changes} entries removed`);
        return result.changes;
    },

    // Get stats
    stats() {
        const db = getDb();
        const total = db.prepare('SELECT COUNT(*) as count FROM cache').get().count;
        const byType = db.prepare('SELECT type, COUNT(*) as count FROM cache GROUP BY type').all();
        const oldest = db.prepare('SELECT MIN(cached_at) as oldest FROM cache').get();
        return { total, byType, oldest: oldest?.oldest };
    }
};