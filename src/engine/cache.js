import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.resolve(process.cwd(), 'src/engine/cache.json');

class CacheManager {
    constructor() {
        this.cache = {
            feeds: {},      // url -> { timestamp, items }
            inference: {}   // headlineHash -> { score, reasoning }
        };
        this.load();
    }

    load() {
        if (fs.existsSync(CACHE_FILE)) {
            try {
                this.cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
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
}

export const Cache = new CacheManager();
