import 'dotenv/config';
import Parser from 'rss-parser';
import fs from 'fs';
import { Pipeline } from '../src/engine/pipeline.js';
import { retry, withTimeout } from '../src/engine/utils.js';
import { Cache } from '../src/engine/cache.js';
import { CONFIG } from '../src/engine/config.js';
import { execSync } from 'child_process';

// Professional headers to avoid blocking
const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    }
});

const pipeline = new Pipeline();

// ELITE NEWS SOURCES: Verified endpoints for 2026
const PREMIUM_FEEDS = [
    // POLITICS
    { name: 'Politics', url: 'https://www.theguardian.com/politics/rss', publisher: 'The Guardian', tier: 1 },
    { name: 'Politics', url: 'http://feeds.bbci.co.uk/news/politics/rss.xml', publisher: 'BBC News', tier: 1 },
    { name: 'Politics', url: 'http://www.politico.com/rss/politicopicks.xml', publisher: 'Politico', tier: 1 },
    { name: 'Politics', url: 'https://news.google.com/rss/search?q=US+Politics+government+when:1d&hl=en-US&gl=US&ceid=US:en', publisher: 'Various', tier: 2 },

    // STOCKS & FINANCE
    { name: 'Stocks', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', publisher: 'CNBC Markets', tier: 1 },
    { name: 'Stocks', url: 'https://finance.yahoo.com/news/rssindex', publisher: 'Yahoo Finance', tier: 2 },
    { name: 'Stocks', url: 'http://feeds.marketwatch.com/marketwatch/topstories/', publisher: 'MarketWatch', tier: 2 },
    { name: 'Finance', url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', publisher: 'CNBC Economy', tier: 1 },
    { name: 'Finance', url: 'https://www.ft.com/?format=rss', publisher: 'Financial Times', tier: 1 },

    // TECHNOLOGY
    { name: 'Technology', url: 'https://techcrunch.com/feed/', publisher: 'TechCrunch', tier: 1 },
    { name: 'Technology', url: 'https://www.theverge.com/rss/index.xml', publisher: 'The Verge', tier: 2 },
    { name: 'Technology', url: 'https://feeds.arstechnica.com/arstechnica/index', publisher: 'Ars Technica', tier: 2 },
    { name: 'Technology', url: 'https://www.technologyreview.com/feed/', publisher: 'MIT Tech Review', tier: 1 },

    // WORLD
    { name: 'World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', publisher: 'BBC World', tier: 1 },
    { name: 'World', url: 'https://www.theguardian.com/world/rss', publisher: 'The Guardian', tier: 1 },
    { name: 'World', url: 'https://www.aljazeera.com/xml/rss/all.xml', publisher: 'Al Jazeera', tier: 1 },

    // SCIENCE
    { name: 'Science', url: 'https://www.wired.com/feed/category/science/latest/rss', publisher: 'Wired', tier: 1 },
    { name: 'Science', url: 'https://www.sciencedaily.com/rss/all.xml', publisher: 'Science Daily', tier: 2 },
    { name: 'Science', url: 'https://www.nature.com/nature.rss', publisher: 'Nature', tier: 1 },
    { name: 'Science', url: 'https://phys.org/rss-feed/', publisher: 'Phys.org', tier: 2 },
    { name: 'Science', url: 'https://www.theguardian.com/science/rss', publisher: 'The Guardian', tier: 1 },

    // GOOGLE NEWS AGGREGATION (MASSIVE SOURCE INJECTION)
    { name: 'Politics', url: 'https://news.google.com/rss/headlines/section/topic/NATION', publisher: 'Various', tier: 2 },
    { name: 'Stocks', url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS', publisher: 'Various', tier: 2 },
    { name: 'Technology', url: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY', publisher: 'Various', tier: 2 },
    { name: 'World', url: 'https://news.google.com/rss/headlines/section/topic/WORLD', publisher: 'Various', tier: 2 },
    { name: 'Science', url: 'https://news.google.com/rss/headlines/section/topic/SCIENCE', publisher: 'Various', tier: 2 }
];

/**
 * Fetches a single feed with timeout.
 * @param {Object} feed - Feed configuration.
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @returns {Promise<Object>} - { success: boolean, feed, articles?, error? }
 */
async function fetchWithTimeout(feed, timeoutMs) {
    try {
        const data = await withTimeout(
            retry(() => parser.parseURL(feed.url), 2, 5000),
            timeoutMs,
            `fetchFeed:${feed.publisher}`
        );
        return { success: true, feed, data };
    } catch (e) {
        return { success: false, feed, error: e.message };
    }
}

/**
 * Fetches all feeds in parallel batches with concurrency limit.
 * @param {Array} feeds - Array of feed configurations.
 * @returns {Promise<Array>} - Array of { success, feed, articles?, error? }
 */
async function fetchAllFeeds(feeds) {
    const results = [];
    const CONCURRENCY = CONFIG.FEED_CONCURRENCY;

    for (let i = 0; i < feeds.length; i += CONCURRENCY) {
        const batch = feeds.slice(i, i + CONCURRENCY);
        const batchPromises = batch.map(feed => fetchWithTimeout(feed, CONFIG.FEED_FETCH_TIMEOUT));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }

    return results;
}

/**
 * Process raw feed data into articles.
 * @param {Object} feed - Feed configuration.
 * @param {Object} data - Parsed RSS data.
 * @returns {Array} - Processed articles.
 */
function processFeedData(feed, data) {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    return data.items
        .map(item => {
            let source = feed.publisher;
            if (source === 'Various') {
                source = item.source || (item.title && item.title.includes(' - ') ? item.title.split(' - ').pop() : 'News');
            }

            let cleanTitle = (item.title || "").trim();
            if (cleanTitle.includes(' - ')) {
                const parts = cleanTitle.split(' - ');
                parts.pop();
                cleanTitle = parts.join(' - ');
            }

            return {
                title: cleanTitle.trim(),
                source: source.trim(),
                link: item.link,
                pubDate: new Date(item.isoDate || item.pubDate),
                tier: feed.tier
            };
        })
        .filter(item => {
            const isRecent = item.pubDate >= twentyFourHoursAgo;
            if (!isRecent || !item.title) return false;

            // HARD FILTER: Prevent sports/lifestyle bleed into Politics
            if (feed.name === 'Politics') {
                const lowTitle = item.title.toLowerCase();
                const banned = ['beat', 'score', 'striker', 'football', 'soccer', 'win', 'goal', 'liverpool', 'united', 'v.', 'vs', 'league', 'chelsea', 'arsenal'];
                if (banned.some(b => lowTitle.includes(b)) && !lowTitle.includes('poll')) return false;
            }
            return true;
        })
        .slice(0, CONFIG.MAX_ARTICLES_PER_FEED);
}

async function gatherNews() {
    console.log('Gathering REAL-TIME ELITE news feeds (with Pro Headers)...');

    const categoryMap = {};
    const now = new Date();

    // Fetch all feeds in parallel
    console.log(`Fetching from ${PREMIUM_FEEDS.length} feeds with concurrency ${CONFIG.FEED_CONCURRENCY}...`);
    const results = await fetchAllFeeds(PREMIUM_FEEDS);

    for (const result of results) {
        const feed = result.feed;

        if (result.success) {
            console.log(`Fetching from ${feed.publisher} (${feed.name})...`);
            const rawArticles = processFeedData(feed, result.data);

            // Update cache on success
            Cache.setFeed(feed.url, rawArticles);

            if (!categoryMap[feed.name]) {
                categoryMap[feed.name] = [];
            }
            categoryMap[feed.name].push(...rawArticles);

            console.log(`  └─ Found ${rawArticles.length} recent articles.`);
        } else {
            console.error(`  └─ Error fetching ${feed.publisher}: ${result.error}. Using cache fallback...`);
            const cached = Cache.getFeed(feed.url);
            if (cached && cached.items) {
                if (!categoryMap[feed.name]) categoryMap[feed.name] = [];
                categoryMap[feed.name].push(...cached.items);
                console.log(`  └─ Loaded ${cached.items.length} articles from cache (timestamp: ${cached.timestamp})`);
            }
        }
    }

    const categoriesArray = Object.keys(categoryMap).map(name => ({
        name,
        rawArticles: categoryMap[name]
    })).sort((a, b) => {
        const order = ['World', 'Politics', 'Finance', 'Technology', 'Science', 'Stocks'];
        return order.indexOf(a.name) - order.indexOf(b.name);
    });

    console.log('Processing data through AI Pipeline...');
    const newsTree = await pipeline.run(categoriesArray);

    newsTree.lastUpdated = now.toISOString();

    // --- Cache Garbage Collection ---
    const activeRawArticles = [];
    categoriesArray.forEach(cat => {
        if (cat.rawArticles) activeRawArticles.push(...cat.rawArticles);
    });

    const activeClusters = [];
    if (newsTree.children) {
        newsTree.children.forEach(cat => {
            if (cat.children) activeClusters.push(...cat.children);
        });
    }

    Cache.prune(activeRawArticles, activeClusters);
    // --------------------------------

    // 1. apply manual overrides
    applyOverrides(newsTree);

    // 2. validate output (Anomaly Detection)
    if (validateOutput(newsTree)) {
        const content = `export const newsData = ${JSON.stringify(newsTree, null, 2)};`;
        fs.writeFileSync('./src/data.js', content);
        console.log(`Success! newsData updated for ${now.toLocaleTimeString()}`);

        console.log('Running static SEO generation...');
        execSync('node scripts/generate-static.js', { stdio: 'inherit' });
    } else {
        console.error("CRITICAL: Data validation failed. Update aborted to prevent dashboard corruption.");
    }
}

function applyOverrides(tree) {
    const overridesPath = './src/engine/overrides.json';
    if (!fs.existsSync(overridesPath)) return;

    try {
        const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));

        tree.children.forEach(category => {
            category.children = category.children.filter(story => {
                // Hide stories matches by title
                return !overrides.hidden.some(h => story.representativeTitle.toLowerCase().includes(h.toLowerCase()));
            });

            category.children.forEach(story => {
                // Apply sentiment overrides
                if (overrides.sentimentOverrides[story.representativeTitle]) {
                    story.sentiment = overrides.sentimentOverrides[story.representativeTitle];
                }
            });
        });
    } catch (e) {
        console.error("Failed to apply overrides:", e.message);
    }
}

function validateOutput(tree) {
    // Basic structural check
    if (!tree.children || tree.children.length === 0) return false;

    // Count total clusters
    let totalClusters = 0;
    tree.children.forEach(c => totalClusters += (c.children ? c.children.length : 0));

    // Anomaly detection: If we have 0 clusters, something is likely wrong with the AI/Pipeline
    if (totalClusters === 0) return false;

    // Minimum category check
    if (tree.children.length < CONFIG.MIN_CATEGORIES_FOR_VALIDATION) return false;

    return true;
}

gatherNews().then(() => {
    process.exit(0);
}).catch(err => {
    console.error("Scraper failed:", err);
    process.exit(1);
});
