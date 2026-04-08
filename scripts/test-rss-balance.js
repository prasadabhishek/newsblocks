/**
 * RSS Feed Balance Analyzer
 *
 * Analyzes actual content distribution across feeds and identifies:
 * 1. Which feeds are delivering what categories
 * 2. Why Politics dominates and World/US/Stocks are missing
 * 3. Quality of each feed's content
 *
 * Run: node scripts/test-rss-balance.js
 */

import Parser from 'rss-parser';
import { writeFileSync } from 'fs';

const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    }
});

// Comprehensive feed list to test - organized by INTENDED category
const ALL_FEEDS = [
    // WORLD NEWS - Intentionally diverse international sources
    { name: 'World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', publisher: 'BBC World', tier: 1 },
    { name: 'World', url: 'https://www.theguardian.com/world/rss', publisher: 'The Guardian', tier: 1 },
    { name: 'World', url: 'https://www.aljazeera.com/xml/rss/all.xml', publisher: 'Al Jazeera', tier: 1 },
    { name: 'World', url: 'https://www.reutersagency.com/feed/', publisher: 'Reuters Agency', tier: 2 },
    { name: 'World', url: 'https://www.cnn.com/world/rss', publisher: 'CNN', tier: 1 },
    { name: 'World', url: 'https://www.france24.com/en/rss', publisher: 'France 24', tier: 1 },
    { name: 'World', url: 'https://www.dw.com/en/world/rss', publisher: 'Deutsche Welle', tier: 1 },
    { name: 'World', url: 'https://www.scmp.com/rss/world.xml', publisher: 'SCMP', tier: 1 },

    // US NATIONAL - US-focused news sources
    { name: 'US', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', publisher: 'BBC US', tier: 1 },
    { name: 'US', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Americas.xml', publisher: 'NY Times Americas', tier: 1 },
    { name: 'US', url: 'https://feeds.washingtonpost.com/rss/national', publisher: 'Washington Post', tier: 1 },
    { name: 'US', url: 'https://www.cnn.com/nation/rss', publisher: 'CNN Nation', tier: 1 },
    { name: 'US', url: 'https://www.nbcnews.com/rss', publisher: 'NBC News', tier: 2 },
    { name: 'US', url: 'https://www.abcnews.com/rss', publisher: 'ABC News', tier: 2 },

    // STOCKS & FINANCE - Market and financial news
    { name: 'Stocks', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', publisher: 'CNBC Markets', tier: 1 },
    { name: 'Stocks', url: 'https://finance.yahoo.com/news/rssindex', publisher: 'Yahoo Finance', tier: 2 },
    { name: 'Stocks', url: 'http://feeds.marketwatch.com/marketwatch/topstories/', publisher: 'MarketWatch', tier: 2 },
    { name: 'Finance', url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', publisher: 'CNBC Economy', tier: 1 },
    { name: 'Finance', url: 'https://www.ft.com/?format=rss', publisher: 'Financial Times', tier: 1 },
    { name: 'Finance', url: 'https://feeds.bloomberg.com/markets/news.rss', publisher: 'Bloomberg Markets', tier: 1 },
    { name: 'Finance', url: 'https://feeds.reuters.com/reuters/businessNews', publisher: 'Reuters Business', tier: 1 },

    // POLITICS - Political news
    { name: 'Politics', url: 'https://www.theguardian.com/politics/rss', publisher: 'The Guardian', tier: 1 },
    { name: 'Politics', url: 'http://feeds.bbci.co.uk/news/politics/rss.xml', publisher: 'BBC Politics', tier: 1 },
    { name: 'Politics', url: 'https://www.politico.com/rss/politicopicks.xml', publisher: 'Politico', tier: 1 },
    { name: 'Politics', url: 'https://thehill.com/opinion/feed/', publisher: 'The Hill Opinion', tier: 1 },

    // TECHNOLOGY
    { name: 'Technology', url: 'https://techcrunch.com/feed/', publisher: 'TechCrunch', tier: 1 },
    { name: 'Technology', url: 'https://www.theverge.com/rss/index.xml', publisher: 'The Verge', tier: 2 },
    { name: 'Technology', url: 'https://feeds.arstechnica.com/arstechnica/index', publisher: 'Ars Technica', tier: 2 },
    { name: 'Technology', url: 'https://www.technologyreview.com/feed/', publisher: 'MIT Tech Review', tier: 1 },
    { name: 'Technology', url: 'https://www.wired.com/feed/rss', publisher: 'Wired', tier: 1 },
    { name: 'Technology', url: 'https://feeds.bloomberg.com/technology/news.rss', publisher: 'Bloomberg Tech', tier: 1 },

    // SCIENCE
    { name: 'Science', url: 'https://www.wired.com/feed/category/science/latest/rss', publisher: 'Wired Science', tier: 1 },
    { name: 'Science', url: 'https://www.sciencedaily.com/rss/all.xml', publisher: 'Science Daily', tier: 2 },
    { name: 'Science', url: 'https://www.nature.com/nature.rss', publisher: 'Nature', tier: 1 },
    { name: 'Science', url: 'https://phys.org/rss-feed/', publisher: 'Phys.org', tier: 2 },
    { name: 'Science', url: 'https://www.theguardian.com/science/rss', publisher: 'The Guardian Science', tier: 1 },

    // Google News Topic Aggregation
    { name: 'World', url: 'https://news.google.com/rss/headlines/section/topic/WORLD', publisher: 'Google World', tier: 2 },
    { name: 'US', url: 'https://news.google.com/rss/headlines/section/topic/NATION', publisher: 'Google US', tier: 2 },
    { name: 'Stocks', url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS', publisher: 'Google Business', tier: 2 },
    { name: 'Politics', url: 'https://news.google.com/rss/headlines/section/topic/POLITICS', publisher: 'Google Politics', tier: 2 },
    { name: 'Technology', url: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY', publisher: 'Google Tech', tier: 2 },
    { name: 'Science', url: 'https://news.google.com/rss/headlines/section/topic/SCIENCE', publisher: 'Google Science', tier: 2 }
];

// Keywords to detect actual content category
const CATEGORY_KEYWORDS = {
    World: ['war', 'conflict', 'international', 'foreign', 'diplomatic', 'summit', 'global', 'europe', 'asia', 'africa', 'latin america', 'middle east', 'ukraine', 'russia', 'china', 'european union', 'united nations', 'g20', 'g7'],
    US: ['congress', 'senate', 'house', 'white house', 'federal', 'supreme court', 'governor', 'state', 'election', 'vote', 'campaign', 'democrat', 'republican', 'caps', 'stimulus', 'administration', 'federal reserve'],
    Stocks: ['stock', 'market', 'shares', 'nasdaq', 'dow', 's&p', 'trading', 'investor', 'rally', 'index', 'bull', 'bear', 'ipo', 'earnings', 'revenue', 'profit', 'quarterly'],
    Finance: ['economy', 'gdp', 'inflation', 'interest rate', 'federal reserve', 'treasury', 'bond', 'dollar', 'currency', 'trade war', 'recession', 'unemployment', 'jobs report'],
    Politics: ['trump', 'biden', 'administration', 'congressional', 'legislation', 'bill', 'senator', 'representative', 'party', 'partisan', 'election', 'campaign', 'policy', 'white house'],
    Technology: ['apple', 'google', 'microsoft', 'amazon', 'meta', 'facebook', 'tesla', 'ai', 'artificial intelligence', 'startup', 'software', 'app', 'cyber', 'hack', 'data', 'privacy', 'tech'],
    Science: ['research', 'study', 'scientist', 'discovery', 'climate', 'space', 'nasa', 'genetic', 'cancer', 'vaccine', 'medical', 'physics', 'biology', 'ocean', 'species', 'environment']
};

// Keywords that indicate non-hard-news or should be filtered
const JUNK_KEYWORDS = ['ticker', 'price alert', 'best of', 'top 10', 'top 5', 'how to buy', 'should you', 'review', 'picks', 'gift', 'deal', 'sale', 'discount'];

function categorizeByKeywords(title) {
    const t = title.toLowerCase();
    const scores = {};

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        scores[category] = 0;
        for (const keyword of keywords) {
            if (t.includes(keyword)) {
                scores[category]++;
            }
        }
    }

    // Find max score
    let maxCat = 'World';
    let maxScore = 0;
    for (const [cat, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            maxCat = cat;
        }
    }

    return { category: maxCat, confidence: maxScore };
}

function isJunk(title) {
    const t = title.toLowerCase();
    return JUNK_KEYWORDS.some(j => t.includes(j));
}

async function testFeed(feed) {
    const result = {
        ...feed,
        accessible: false,
        statusCode: null,
        error: null,
        totalArticles: 0,
        freshArticles: 0,
        categories: { World: 0, US: 0, Stocks: 0, Finance: 0, Politics: 0, Technology: 0, Science: 0 },
        junkArticles: 0,
        sampleTitles: []
    };

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    try {
        const response = await fetch(feed.url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            }
        });

        result.statusCode = response.status;

        if (response.status === 200) {
            result.accessible = true;
            const text = await response.text();

            // Check for blocks
            if (text.includes('Access Denied') || text.includes('403 Forbidden') || text.length < 500) {
                result.accessible = false;
                result.error = 'Blocked';
                return result;
            }

            const parsed = await parser.parseString(text);
            result.totalArticles = parsed.items?.length || 0;

            for (const item of (parsed.items || []).slice(0, 20)) {
                const title = item.title || '';

                // Check freshness
                const pubDate = new Date(item.pubDate || item.isoDate);
                if (pubDate >= twentyFourHoursAgo) {
                    result.freshArticles++;
                }

                // Check for junk
                if (isJunk(title)) {
                    result.junkArticles++;
                }

                // Categorize
                const { category, confidence } = categorizeByKeywords(title);
                if (confidence > 0) {
                    result.categories[category]++;
                }

                // Collect sample titles
                if (result.sampleTitles.length < 5) {
                    result.sampleTitles.push(title.substring(0, 80));
                }
            }
        } else {
            result.error = `HTTP ${response.status}`;
        }
    } catch (e) {
        result.error = e.message;
    }

    return result;
}

async function main() {
    console.log('RSS Feed Balance Analyzer');
    console.log('='.repeat(80));
    console.log('\nTesting all feeds...\n');

    const results = [];
    const byIntendedCategory = {};

    for (const feed of ALL_FEEDS) {
        if (!byIntendedCategory[feed.name]) {
            byIntendedCategory[feed.name] = [];
        }

        const result = await testFeed(feed);
        results.push(result);
        byIntendedCategory[feed.name].push(result);

        const status = result.accessible ? '✓' : '✗';
        const freshPct = result.totalArticles > 0 ? Math.round(result.freshArticles / Math.min(result.totalArticles, 20) * 100) : 0;
        console.log(`${status} ${result.publisher} (${feed.name}): ${result.statusCode || 'ERR'} - ${result.totalArticles} articles, ${freshPct}% fresh`);

        await new Promise(r => setTimeout(r, 300));
    }

    // Analysis
    console.log('\n\n' + '='.repeat(80));
    console.log('ANALYSIS BY INTENDED CATEGORY');
    console.log('='.repeat(80));

    for (const [catName, feeds] of Object.entries(byIntendedCategory)) {
        console.log(`\n${catName.toUpperCase()}:`);

        const accessible = feeds.filter(f => f.accessible);
        const totalFresh = accessible.reduce((sum, f) => sum + f.freshArticles, 0);
        const totalArticles = accessible.reduce((sum, f) => sum + f.totalArticles, 0);

        // Aggregate actual categories delivered
        const actualCats = { World: 0, US: 0, Stocks: 0, Finance: 0, Politics: 0, Technology: 0, Science: 0 };
        for (const f of accessible) {
            for (const [cat, count] of Object.entries(f.categories)) {
                actualCats[cat] += count;
            }
        }

        console.log(`  Feeds: ${accessible.length}/${feeds.length} accessible`);
        console.log(`  Total articles (24h): ${totalFresh}`);
        console.log(`  Actual category distribution:`);

        const sortedCats = Object.entries(actualCats).sort((a, b) => b[1] - a[1]);
        for (const [cat, count] of sortedCats) {
            if (count > 0) {
                const bar = '█'.repeat(Math.round(count / Math.max(...Object.values(actualCats)) * 20));
                console.log(`    ${cat.padEnd(12)}: ${bar} (${count})`);
            }
        }

        // Show broken feeds
        const broken = feeds.filter(f => !f.accessible);
        if (broken.length > 0) {
            console.log(`  BROKEN FEEDS:`);
            for (const f of broken) {
                console.log(`    - ${f.publisher}: ${f.error}`);
            }
        }

        // Sample titles from top feeds
        const topFeeds = accessible.sort((a, b) => b.freshArticles - a.freshArticles).slice(0, 2);
        if (topFeeds.length > 0) {
            console.log(`  Sample titles:`);
            for (const f of topFeeds) {
                for (const title of f.sampleTitles.slice(0, 2)) {
                    console.log(`    "${title}"`);
                }
            }
        }
    }

    // Summary: What categories are actually being delivered?
    console.log('\n\n' + '='.repeat(80));
    console.log('ACTUAL CONTENT DISTRIBUTION (What stories are we actually getting?)');
    console.log('='.repeat(80));

    const totalDistribution = { World: 0, US: 0, Stocks: 0, Finance: 0, Politics: 0, Technology: 0, Science: 0 };
    const totalJunk = { World: 0, US: 0, Stocks: 0, Finance: 0, Politics: 0, Technology: 0, Science: 0 };

    for (const [catName, feeds] of Object.entries(byIntendedCategory)) {
        for (const f of feeds) {
            if (f.accessible) {
                for (const [cat, count] of Object.entries(f.categories)) {
                    totalDistribution[cat] += count;
                }
                totalJunk[catName] += f.junkArticles;
            }
        }
    }

    const total = Object.values(totalDistribution).reduce((a, b) => a + b, 0);
    console.log('\n| Category | Count | Percentage |');
    console.log('|----------|-------|------------|');
    for (const [cat, count] of Object.entries(totalDistribution).sort((a, b) => b[1] - a[1])) {
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        console.log(`| ${cat.padEnd(12)} | ${count.toString().padStart(5)} | ${pct.padStart(6)}% |`);
    }

    // Recommendations
    console.log('\n\n' + '='.repeat(80));
    console.log('RECOMMENDATIONS');
    console.log('='.repeat(80));

    // Find broken feeds
    console.log('\n1. REMOVE BROKEN FEEDS:');
    for (const [catName, feeds] of Object.entries(byIntendedCategory)) {
        for (const f of feeds) {
            if (!f.accessible) {
                console.log(`   - ${f.publisher} (${catName}): ${f.error}`);
            }
        }
    }

    // Find feeds that deliver wrong content
    console.log('\n2. FEEDS DELIVERING WRONG CATEGORY:');
    for (const [catName, feeds] of Object.entries(byIntendedCategory)) {
        for (const f of feeds) {
            if (f.accessible) {
                const dominantActual = Object.entries(f.categories).sort((a, b) => b[1] - a[1])[0];
                if (dominantActual && dominantActual[1] > 0 && dominantActual[0] !== catName) {
                    console.log(`   - ${f.publisher} (intended: ${catName}, actual: ${dominantActual[0]})`);
                }
            }
        }
    }

    // High quality feeds per category
    console.log('\n3. BEST FEEDS PER CATEGORY:');
    for (const catName of ['World', 'US', 'Stocks', 'Finance', 'Technology', 'Science']) {
        const feeds = byIntendedCategory[catName]?.filter(f => f.accessible && f.freshArticles > 0) || [];
        if (feeds.length > 0) {
            const sorted = feeds.sort((a, b) => b.freshArticles - a.freshArticles);
            const best = sorted[0];
            console.log(`   ${catName}: ${best.publisher} (${best.freshArticles} fresh articles)`);
        } else {
            console.log(`   ${catName}: NO WORKING FEEDS`);
        }
    }

    // Save detailed report
    writeFileSync('./rss-balance-report.json', JSON.stringify({
        generated: new Date().toISOString(),
        results,
        byIntendedCategory,
        totalDistribution,
        totalJunk
    }, null, 2));

    console.log('\n\nDetailed report saved to: rss-balance-report.json');
}

main().catch(console.error);
