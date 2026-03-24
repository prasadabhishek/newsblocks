import fs from 'fs';
import path from 'path';
import { hashString } from './utils.js';
import { CONFIG } from './config.js';

const CACHE_FILE = path.resolve(process.cwd(), 'src/engine/cache.json');
const SAVE_DEBOUNCE_MS = 5000;

class CacheManager {
    constructor() {
        this.cache = {
            feeds: {},      // url -> { timestamp, items, cachedAt }
            inference: {},  // headlineHash -> { sentiment, relevance, reasoning, cachedAt }
            embeddings: {}  // headlineHash -> { vector, cachedAt }
        };
        this.saveTimer = null;
        this.load();
        // Save on process exit if there are pending writes
        process.on('exit', () => {
            if (this.saveTimer) {
                this._doSave();
            }
        });
    }

    load() {
        if (fs.existsSync(CACHE_FILE)) {
            try {
                this.cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
                // Ensure sub-objects exist even if loading from an older schema or empty file
                if (!this.cache.feeds) this.cache.feeds = {};
                if (!this.cache.inference) this.cache.inference = {};
                if (!this.cache.embeddings) this.cache.embeddings = {};
            } catch (e) {
                console.error("Failed to load cache:", e.message);
            }
        }
    }

    /**
     * Debounced save - schedules a save after 5s of inactivity.
     * Multiple calls within the window reset the timer.
     */
    save() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
            this._doSave();
        }, SAVE_DEBOUNCE_MS);
    }

    /**
     * Internal save that checks size and evicts if needed.
     */
    _doSave() {
        try {
            // Check file size
            const sizeBytes = fs.existsSync(CACHE_FILE)
                ? fs.statSync(CACHE_FILE).size
                : 0;
            const sizeMB = sizeBytes / (1024 * 1024);

            if (sizeMB > CONFIG.MAX_CACHE_SIZE_MB) {
                const overageMB = sizeMB - CONFIG.MAX_CACHE_SIZE_MB;
                const overageBytes = overageMB * 1024 * 1024;
                this._evictOldest(overageBytes);
            }

            fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2));
        } catch (e) {
            console.error("Failed to save cache:", e.message);
        } finally {
            this.saveTimer = null;
        }
    }

    /**
     * LRU eviction - removes oldest entries to make space.
     * @param {number} overageBytes - Number of bytes to free.
     */
    _evictOldest(overageBytes) {
        const entries = [];

        // Collect all entries with their cachedAt timestamps
        for (const [key, val] of Object.entries(this.cache.feeds)) {
            entries.push({ type: 'feeds', key, cachedAt: val.cachedAt || val.timestamp, size: JSON.stringify(val).length });
        }
        for (const [key, val] of Object.entries(this.cache.inference)) {
            entries.push({ type: 'inference', key, cachedAt: val.cachedAt, size: JSON.stringify(val).length });
        }
        for (const [key, val] of Object.entries(this.cache.embeddings)) {
            entries.push({ type: 'embeddings', key, cachedAt: val.cachedAt, size: JSON.stringify(val).length });
        }

        // Sort by cachedAt (oldest first)
        entries.sort((a, b) => new Date(a.cachedAt) - new Date(b.cachedAt));

        let freedBytes = 0;
        for (const entry of entries) {
            if (freedBytes >= overageBytes) break;

            if (entry.type === 'feeds') {
                delete this.cache.feeds[entry.key];
            } else if (entry.type === 'inference') {
                delete this.cache.inference[entry.key];
            } else if (entry.type === 'embeddings') {
                delete this.cache.embeddings[entry.key];
            }
            freedBytes += entry.size;
        }

        console.log(`Cache eviction: freed ${(freedBytes / (1024 * 1024)).toFixed(2)}MB`);
    }

    getFeed(url) {
        return this.cache.feeds[url];
    }

    setFeed(url, items) {
        this.cache.feeds[url] = {
            timestamp: new Date().toISOString(),
            cachedAt: new Date().toISOString(),
            items: items
        };
        this.save();
    }

    getInference(hash) {
        return this.cache.inference[hash];
    }

    setInference(hash, result) {
        this.cache.inference[hash] = {
            ...result,
            cachedAt: new Date().toISOString()
        };
        this.save();
    }

    getEmbedding(hash) {
        const entry = this.cache.embeddings ? this.cache.embeddings[hash] : null;
        return entry ? entry.vector : null;
    }

    setEmbedding(hash, vector) {
        if (!this.cache.embeddings) this.cache.embeddings = {};
        this.cache.embeddings[hash] = {
            vector: vector,
            cachedAt: new Date().toISOString()
        };
        this.save();
    }

    /**
     * Enhanced prune - evicts by age AND removes inactive entries.
     * @param {Array} activeRawArticles - Active articles to preserve.
     * @param {Array} activeClusters - Active clusters to preserve.
     */
    prune(activeRawArticles, activeClusters) {
        if (!this.cache.embeddings || !this.cache.inference) return;

        console.log(`\n🧹 Cache GC: Starting sizes - Embeddings: ${Object.keys(this.cache.embeddings).length}, Inferences: ${Object.keys(this.cache.inference).length}`);

        const now = new Date();
        const activeEmbHashes = new Set(activeRawArticles.map(a => hashString(a.title)));
        const activeInfHashes = new Set(activeClusters.map(c => hashString(c.representativeTitle)));

        let prunedEmb = 0;
        let prunedInf = 0;
        let prunedFeeds = 0;

        // Evict embeddings by age and inactivity
        for (const hash in this.cache.embeddings) {
            const entry = this.cache.embeddings[hash];
            const ageDays = (now - new Date(entry.cachedAt)) / (1000 * 60 * 60 * 24);
            const isStale = ageDays > CONFIG.MAX_EMBEDDING_AGE_DAYS;

            if (isStale || (!activeEmbHashes.has(hash))) {
                delete this.cache.embeddings[hash];
                prunedEmb++;
            }
        }

        // Evict inferences by age and inactivity
        for (const hash in this.cache.inference) {
            const entry = this.cache.inference[hash];
            const ageDays = (now - new Date(entry.cachedAt)) / (1000 * 60 * 60 * 24);
            const isStale = ageDays > CONFIG.MAX_INFERENCE_AGE_DAYS;

            if (isStale || (!activeInfHashes.has(hash))) {
                delete this.cache.inference[hash];
                prunedInf++;
            }
        }

        // Evict old feeds
        for (const url in this.cache.feeds) {
            const entry = this.cache.feeds[url];
            const ageDays = (now - new Date(entry.cachedAt || entry.timestamp)) / (1000 * 60 * 60 * 24);
            if (ageDays > CONFIG.MAX_FEED_AGE_DAYS) {
                delete this.cache.feeds[url];
                prunedFeeds++;
            }
        }

        console.log(`🧹 Cache GC: Pruned ${prunedEmb} stale embeddings, ${prunedInf} stale inferences, ${prunedFeeds} old feeds.`);
        this.save();
    }
}

export const Cache = new CacheManager();
