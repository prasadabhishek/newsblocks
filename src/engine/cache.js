import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.resolve(process.cwd(), 'src/engine/cache.json');

class CacheManager {
    constructor() {
        this.cache = {
            feeds: {},      // url -> { timestamp, items }
            inference: {},  // headlineHash -> { sentiment, relevance, reasoning }
            embeddings: {}  // headlineHash -> [0.1, 0.2, ...]
        };
        this.load();
    }

    load() {
        if (fs.existsSync(CACHE_FILE)) {
            try {
                this.cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
                // Ensure sub-objects exist even if loading from an older schema
                if (!this.cache.inference) this.cache.inference = {};
                if (!this.cache.embeddings) this.cache.embeddings = {};
            } catch (e) {
                console.error("Failed to load cache:", e.message);
            }
        }
    }

    save() {
        try {
            fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2));
        } catch (e) {
            console.error("Failed to save cache:", e.message);
        }
    }

    getFeed(url) {
        return this.cache.feeds[url];
    }

    setFeed(url, items) {
        this.cache.feeds[url] = {
            timestamp: new Date().toISOString(),
            items: items
        };
        this.save();
    }

    getInference(hash) {
        return this.cache.inference[hash];
    }

    setInference(hash, result) {
        this.cache.inference[hash] = result;
        this.save();
    }

    getEmbedding(hash) {
        return this.cache.embeddings ? this.cache.embeddings[hash] : null;
    }

    setEmbedding(hash, vector) {
        if (!this.cache.embeddings) this.cache.embeddings = {};
        this.cache.embeddings[hash] = vector;
        this.save();
    }
}

export const Cache = new CacheManager();
