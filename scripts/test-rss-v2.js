/**
 * RSS Feed Balance Analyzer V2 - Fixed Categorization
 *
 * Uses more specific keywords to avoid AI contamination
 * and focuses on what makes stories truly World/US/Stocks
 *
 * Run: node scripts/test-rss-v2.js
 */

import Parser from 'rss-parser';
import { writeFileSync } from 'fs';

const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    }
});

// Focused keyword sets - specific to avoid AI contamination
const CATEGORY_KEYWORDS = {
    // World: International news, conflicts, diplomacy, specific countries
    World: [
        'war', 'ukraine', 'russia', 'china', 'europe', 'asia', 'africa', 'middle east',
        'lebanon', 'israel', 'gaza', 'hamas', 'iran', 'saudi', 'european union', 'nato',
        'united nations', 'g20', 'summit', 'diplomatic', 'taiwan', 'north korea', 'south korea',
        'australia', 'india', 'brazil', 'mexico', 'canada', 'france', 'germany', 'britain',
        'zimbabwe', 'niger', 'south africa', 'egypt', 'pakistan', 'afghanistan', 'iraq', 'syria',
        'haiti', 'colombia', 'peru', 'chile', 'argentina', 'indonesia', 'vietnam', 'thailand',
        'malaysia', 'singapore', 'philippines', 'myanmar', 'bangladesh', 'sri lanka', 'nepal',
        'kenya', 'ethiopia', 'nigeria', 'morocco', 'algeria', 'tunisia', 'libya', 'sudan',
        'turkey', 'poland', 'hungary', 'czech', 'sweden', 'norway', 'finland', 'denmark',
        'netherlands', 'belgium', 'austria', 'switzerland', 'portugal', 'spain', 'italy',
        'greece', 'romania', 'bulgaria', 'ukraine', 'belarus', 'moldova', 'georgia', 'azerbaijan',
        'argentina', 'venezuela', 'cuba', 'jamaica', 'trinidad', 'costa rica', 'panama'
    ],

    // US: Domestic US news - government, elections, states
    US: [
        'congress', 'senate', 'house of representatives', 'supreme court', 'white house',
        'capitol', 'governor', 'state legislature', 'florida', 'texas', 'california', 'new york',
        'illinois', 'ohio', 'pennsylvania', 'arizona', 'nevada', 'michigan', 'georgia',
        'north carolina', 'virginia', 'massachusetts', 'washington state', 'oregon',
        'colorado', 'maryland', 'new jersey', 'connecticut', 'homeland security', 'fbi', 'cia',
        'dea', 'irs', 'sec', 'federal reserve', 'treasury department', 'justice department',
        'senator', 'representative', 'congressman', 'congresswoman', 'mayor', 'city council',
        'election', 'campaign', 'trump', 'biden', 'administration', 'policy', 'bill', 'act',
        'republican', 'democrat', 'gop', 'party', 'voting', 'ballot', 'referendum',
        'immigration', 'border', 'medicare', 'social security', 'medicaid', 'obamacare',
        'stimulus', 'infrastructure', 'tax', 'tariff', 'sanction'
    ],

    // Stocks: Stock market specific - indices, trading, specific market events
    Stocks: [
        'stock market', 'stock', 'stocks', 'shares', 'nasdaq', 'dow jones', 's&p', 'dow',
        'trading', 'trader', 'trades', 'investor', 'investors', 'investing', 'investment',
        'bull market', 'bear market', 'rally', 'selloff', 'correction', 'crash', 'IPO',
        'wall street', 'nyse', 'shareholders', 'earnings', 'quarterly results', 'revenue',
        'profit', 'loss', 'valuation', 'market cap', 'index', 'indexes', 'futures',
        'treasury yields', 'bond yields', 'dollar index', 'vix', 'volatility',
        'IPO', '上市', '公开募股', '是做空', '是做多', 'short selling', 'short squeeze',
        'meme stock', ' meme stocks', 'day trading', 'swing trading', 'portfolio'
    ],

    // Finance: Broader economic indicators
    Finance: [
        'economy', 'economic', 'gdp', 'inflation', 'deflation', 'recession', 'depression',
        'interest rate', 'interest rates', 'federal reserve', 'fed rate', 'monetary policy',
        'bank', 'banking', 'credit', 'debt', 'loan', 'mortgage', 'housing market',
        'unemployment', 'jobs report', 'payroll', 'labor market', 'workforce',
        'consumer spending', 'retail sales', 'manufacturing', 'industrial production',
        'trade deficit', 'trade surplus', 'import', 'export', 'currency', 'dollar', 'euro', 'yuan',
        'oil price', 'crude oil', 'natural gas', 'energy prices', 'commodities', 'gold', 'silver',
        'cryptocurrency', 'bitcoin', 'ethereum', 'blockchain'
    ],

    // Technology: Tech companies and specific tech topics (NOT generic AI)
    Technology: [
        'apple', 'samsung', 'google', 'microsoft', 'amazon', 'meta', 'facebook', 'instagram',
        'tesla', 'nvidia', 'amd', 'intel', 'qualcomm', 'TSMC', 'broadcom',
        'iphone', 'android', 'macbook', 'ipad', 'galaxy', 'pixel', 'surface',
        'app store', 'google play', 'windows', 'macos', 'ios', 'android os',
        'cybersecurity', 'hack', 'breach', 'malware', 'ransomware', 'phishing',
        'data privacy', 'surveillance', 'surveillance capitalism',
        'social media', 'tiktok', 'twitter', 'x.com', 'linkedin', 'snapchat', 'whatsapp',
        'startup', 'venture capital', 'VC', 'funding', 'IPO', 'unicorn', 'acquisition',
        'merger', 'antitrust', 'regulation', 'big tech', 'tech giants', 'silicon valley',
        'gaming', 'video game', 'playstation', 'xbox', 'nintendo', 'steam', 'esports',
        'streaming', 'netflix', 'disney+', 'hulu', 'spotify', 'apple music',
        'smartphone', 'laptop', 'tablet', 'wearable', 'smartwatch', 'headphones',
        'robotics', 'automation', 'drone', 'autonomous vehicle', 'self-driving',
        'quantum computing', 'semiconductor', 'chip', 'processor', 'memory', 'SSD', 'hard drive',
        'network', '5G', '6G', 'broadband', 'wifi', 'satellite', 'starlink',
        'cloud computing', 'AWS', 'azure', 'google cloud', 'data center', 'server'
    ],

    // Science: Scientific research, discoveries, space
    Science: [
        'research', 'study', 'scientist', 'scientists', 'discovery', 'scientific',
        'climate', 'global warming', 'environment', 'carbon', 'emissions', 'pollution',
        'space', 'nasa', 'spacex', 'rocket', 'satellite', 'astronaut', 'cosmonaut',
        'mars', 'moon', 'asteroid', 'comet', 'telescope', 'JWST', 'hubble',
        'genetic', 'gene', 'DNA', 'RNA', 'CRISPR', 'genome', 'mutation',
        'cancer', 'tumor', 'oncology', 'chemotherapy', 'immunotherapy', 'vaccine',
        'medical', 'medicine', 'drug', 'pharmaceutical', 'FDA', 'clinical trial',
        'physics', 'particle', 'quantum', 'relativity', 'gravity', 'black hole',
        'biology', 'evolution', 'species', 'extinction', 'ecosystem', 'biodiversity',
        'ocean', 'marine', 'coral', 'fish', 'whale', 'ocean acidification',
        'archaeology', 'ancient', 'fossil', 'dinosaur', 'prehistoric', 'excavation',
        'psychology', 'mental health', 'brain', 'neuron', 'cognitive', 'behavior',
        'AI can also appear here but only when paired with research/science context'
    ],

    // Politics: US political process (narrow definition)
    Politics: [
        'trump administration', 'biden administration', 'congressional', 'legislation',
        'filibuster', 'cloture', 'quorum', 'caucus', 'Speaker of the House',
        'Majority Leader', 'Minority Leader', 'whip', 'senator', 'representative',
        'impeachment', 'indictment', 'prosecutor', 'investigation', 'inquiry',
        'supreme court nomination', 'judicial appointment', 'constitutional',
        'civil rights', 'voting rights', 'abortion', 'gun rights', 'second amendment',
        'campaign finance', 'PACS', 'super PAC', 'dark money', 'lobbyist', 'lobbying',
        'partisan', 'bipartisan', 'left', 'right', 'progressive', 'conservative',
        'liberal', 'radical', 'extremist', 'faction', 'movement'
    ]
};

// Super narrow "AI" keyword set - only if AI is THE topic, not just mentioned
const AI_TOPICS = [
    'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
    'large language model', 'LLM', 'GPT', 'ChatGPT', 'Claude', 'Gemini AI',
    'AI model', 'AI models', 'foundation model', 'AI startup', 'AI company',
    'AI research', 'AI laboratory', 'OpenAI', 'Anthropic', 'AI safety', 'AI alignment',
    'AI ethics', 'AI regulation', 'AI governance', 'superintelligence', 'AGI'
];

function categorizeTitle(title) {
    const t = title.toLowerCase();
    const scores = {};

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        scores[category] = 0;
        for (const keyword of keywords) {
            if (t.includes(keyword)) {
                scores[category] += 1;
            }
        }
    }

    // AI bonus only if AI is prominent
    let aiBonus = 0;
    for (const aiTopic of AI_TOPICS) {
        if (t.includes(aiTopic)) {
            aiBonus += 3; // Weight AI mentions
        }
    }

    // Find top categories
    let maxCat = 'World';
    let maxScore = 0;
    let secondCat = 'World';
    let secondScore = 0;

    for (const [cat, score] of Object.entries(scores)) {
        if (cat === 'Technology') {
            // AI boosts tech score significantly
            score = score + aiBonus;
        }
        if (score > maxScore) {
            secondScore = maxScore;
            secondCat = maxCat;
            maxScore = score;
            maxCat = cat;
        } else if (score > secondScore) {
            secondScore = score;
            secondCat = cat;
        }
    }

    // If top score is very low, default to World (hard news fallback)
    if (maxScore < 2) {
        return { category: 'World', confidence: maxScore };
    }

    // If top two are very close, might be hybrid (but prefer top)
    return { category: maxCat, confidence: maxScore };
}

async function testFeed(feed) {
    const result = {
        name: feed.name,
        url: feed.url,
        publisher: feed.publisher,
        tier: feed.tier,
        accessible: false,
        statusCode: null,
        error: null,
        totalArticles: 0,
        freshArticles: 0,
        categories: {},
        sampleTitles: []
    };

    for (const cat of Object.keys(CATEGORY_KEYWORDS)) {
        result.categories[cat] = 0;
    }

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

            if (text.includes('Access Denied') || text.includes('403 Forbidden') || text.length < 500) {
                result.accessible = false;
                result.error = 'Blocked';
                return result;
            }

            const parsed = await parser.parseString(text);
            result.totalArticles = parsed.items?.length || 0;

            for (const item of (parsed.items || []).slice(0, 25)) {
                const title = item.title || '';
                const pubDate = new Date(item.pubDate || item.isoDate);

                if (pubDate >= twentyFourHoursAgo) {
                    result.freshArticles++;
                }

                const { category } = categorizeTitle(title);
                result.categories[category]++;

                if (result.sampleTitles.length < 5) {
                    result.sampleTitles.push({ title: title.substring(0, 80), cat: category });
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
    console.log('RSS Feed Balance Analyzer V2 - Fixed Categorization');
    console.log('='.repeat(80));

    // Balanced feed list - minimal, high-quality
    const FEEDS = [
        // WORLD - BBC, Guardian, Al Jazeera, France24, SCMP
        { name: 'World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', publisher: 'BBC World', tier: 1 },
        { name: 'World', url: 'https://www.theguardian.com/world/rss', publisher: 'The Guardian', tier: 1 },
        { name: 'World', url: 'https://www.aljazeera.com/xml/rss/all.xml', publisher: 'Al Jazeera', tier: 1 },
        { name: 'World', url: 'https://www.france24.com/en/rss', publisher: 'France 24', tier: 1 },
        { name: 'World', url: 'https://www.scmp.com/rss/world.xml', publisher: 'SCMP', tier: 1 },
        { name: 'World', url: 'https://www.reutersagency.com/feed/', publisher: 'Reuters Agency', tier: 2 },

        // US - BBC US, NYT, WaPo, NBC
        { name: 'US', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', publisher: 'BBC US', tier: 1 },
        { name: 'US', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Americas.xml', publisher: 'NY Times', tier: 1 },
        { name: 'US', url: 'https://feeds.washingtonpost.com/rss/national', publisher: 'Washington Post', tier: 1 },
        { name: 'US', url: 'https://www.nbcnews.com/rss', publisher: 'NBC News', tier: 2 },

        // STOCKS - CNBC Markets, Yahoo Finance, MarketWatch, Bloomberg Markets
        { name: 'Stocks', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', publisher: 'CNBC Markets', tier: 1 },
        { name: 'Stocks', url: 'https://finance.yahoo.com/news/rssindex', publisher: 'Yahoo Finance', tier: 2 },
        { name: 'Stocks', url: 'http://feeds.marketwatch.com/marketwatch/topstories/', publisher: 'MarketWatch', tier: 2 },
        { name: 'Stocks', url: 'https://feeds.bloomberg.com/markets/news.rss', publisher: 'Bloomberg Markets', tier: 1 },

        // FINANCE - CNBC Economy, FT, Bloomberg
        { name: 'Finance', url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', publisher: 'CNBC Economy', tier: 1 },
        { name: 'Finance', url: 'https://www.ft.com/?format=rss', publisher: 'Financial Times', tier: 1 },
        { name: 'Finance', url: 'https://feeds.reuters.com/reuters/businessNews', publisher: 'Reuters Business', tier: 1 },

        // TECHNOLOGY - TechCrunch, Verge, Ars, MIT, Wired, Bloomberg Tech
        { name: 'Technology', url: 'https://techcrunch.com/feed/', publisher: 'TechCrunch', tier: 1 },
        { name: 'Technology', url: 'https://www.theverge.com/rss/index.xml', publisher: 'The Verge', tier: 2 },
        { name: 'Technology', url: 'https://feeds.arstechnica.com/arstechnica/index', publisher: 'Ars Technica', tier: 2 },
        { name: 'Technology', url: 'https://www.technologyreview.com/feed/', publisher: 'MIT Tech Review', tier: 1 },
        { name: 'Technology', url: 'https://www.wired.com/feed/rss', publisher: 'Wired', tier: 1 },
        { name: 'Technology', url: 'https://feeds.bloomberg.com/technology/news.rss', publisher: 'Bloomberg Tech', tier: 1 },

        // SCIENCE - Wired Science, Science Daily, Nature, Phys.org, Guardian Science
        { name: 'Science', url: 'https://www.wired.com/feed/category/science/latest/rss', publisher: 'Wired Science', tier: 1 },
        { name: 'Science', url: 'https://www.sciencedaily.com/rss/all.xml', publisher: 'Science Daily', tier: 2 },
        { name: 'Science', url: 'https://www.nature.com/nature.rss', publisher: 'Nature', tier: 1 },
        { name: 'Science', url: 'https://phys.org/rss-feed/', publisher: 'Phys.org', tier: 2 },
        { name: 'Science', url: 'https://www.theguardian.com/science/rss', publisher: 'Guardian Science', tier: 1 },

        // POLITICS - Guardian, BBC Politics, Hill, Google Politics
        { name: 'Politics', url: 'https://www.theguardian.com/politics/rss', publisher: 'Guardian Politics', tier: 1 },
        { name: 'Politics', url: 'http://feeds.bbci.co.uk/news/politics/rss.xml', publisher: 'BBC Politics', tier: 1 },
        { name: 'Politics', url: 'https://thehill.com/opinion/feed/', publisher: 'The Hill', tier: 1 },

        // GOOGLE NEWS (cross-category aggregation)
        { name: 'World', url: 'https://news.google.com/rss/headlines/section/topic/WORLD', publisher: 'Google World', tier: 2 },
        { name: 'US', url: 'https://news.google.com/rss/headlines/section/topic/NATION', publisher: 'Google US', tier: 2 },
        { name: 'Stocks', url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS', publisher: 'Google Business', tier: 2 },
        { name: 'Technology', url: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY', publisher: 'Google Tech', tier: 2 },
        { name: 'Science', url: 'https://news.google.com/rss/headlines/section/topic/SCIENCE', publisher: 'Google Science', tier: 2 }
    ];

    console.log('\nTesting feeds...\n');

    const results = [];
    const byCategory = {};

    for (const feed of FEEDS) {
        if (!byCategory[feed.name]) byCategory[feed.name] = [];
        const result = await testFeed(feed);
        results.push(result);
        byCategory[feed.name].push(result);

        const status = result.accessible ? '✓' : '✗';
        const freshPct = result.totalArticles > 0 ? Math.round(result.freshArticles / Math.min(result.totalArticles, 25) * 100) : 0;
        console.log(`${status} ${result.publisher} (${feed.name}): ${result.statusCode || 'ERR'} - ${result.totalArticles} articles, ${freshPct}% fresh`);

        await new Promise(r => setTimeout(r, 300));
    }

    // Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('CATEGORY DISTRIBUTION ANALYSIS');
    console.log('='.repeat(80));

    const totals = {};
    for (const cat of Object.keys(CATEGORY_KEYWORDS)) {
        totals[cat] = 0;
    }

    for (const [catName, feeds] of Object.entries(byCategory)) {
        console.log(`\n${catName.toUpperCase()} FEEDS:`);
        const accessible = feeds.filter(f => f.accessible);
        const totalFresh = accessible.reduce((s, f) => s + f.freshArticles, 0);

        for (const f of accessible) {
            const catDist = Object.entries(f.categories).sort((a, b) => b[1] - a[1]);
            const top = catDist[0];
            console.log(`  ${f.publisher}: ${f.freshArticles} fresh, top=${top[0]}(${top[1]})`);

            for (const [cat, count] of Object.entries(f.categories)) {
                totals[cat] += count;
            }
        }

        const broken = feeds.filter(f => !f.accessible);
        if (broken.length > 0) {
            console.log(`  BROKEN: ${broken.map(f => `${f.publisher}(${f.error})`).join(', ')}`);
        }
    }

    // Overall distribution
    console.log('\n\n' + '='.repeat(80));
    console.log('ACTUAL CONTENT DISTRIBUTION');
    console.log('='.repeat(80));

    const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
    console.log('\n| Category   | Count | Pct    |');
    console.log('|------------|-------|--------|');
    for (const [cat, count] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
        const pct = grandTotal > 0 ? ((count / grandTotal) * 100).toFixed(1) : '0.0';
        console.log(`| ${cat.padEnd(10)} | ${count.toString().padStart(5)} | ${pct.padStart(5)}% |`);
    }

    // Recommendations
    console.log('\n\n' + '='.repeat(80));
    console.log('OPTIMIZED FEED LIST FOR BALANCED CATEGORIES');
    console.log('='.repeat(80));

    // Select best feeds per category
    const recommendedFeeds = [];
    const usedPublishers = new Set();

    for (const cat of ['World', 'US', 'Stocks', 'Finance', 'Technology', 'Science', 'Politics']) {
        const catFeeds = byCategory[cat]?.filter(f => f.accessible && f.freshArticles > 0) || [];
        const sorted = catFeeds.sort((a, b) => {
            // Prefer feeds that deliver their intended category
            const aMatch = a.categories[cat] || 0;
            const bMatch = b.categories[cat] || 0;
            return bMatch - aMatch || b.freshArticles - a.freshArticles;
        });

        // Pick top 2-3 feeds per category
        for (const f of sorted.slice(0, 3)) {
            if (!usedPublishers.has(f.publisher)) {
                usedPublishers.add(f.publisher);
                recommendedFeeds.push({
                    name: cat,
                    url: f.url,
                    publisher: f.publisher,
                    tier: f.tier,
                    reason: `Delivers ${cat} content (${f.categories[cat]} matches)`
                });
            }
        }
    }

    console.log('\nRECOMMENDED FEEDS:\n');
    for (const feed of recommendedFeeds) {
        console.log(`// ${feed.name.toUpperCase()}`);
        console.log(`{ name: '${feed.name}', url: '${feed.url}', publisher: '${feed.publisher}', tier: ${feed.tier} },`);
        console.log(`  // ${feed.reason}\n`);
    }

    // Save report
    writeFileSync('./rss-optimized-report.json', JSON.stringify({
        generated: new Date().toISOString(),
        totals,
        recommendedFeeds
    }, null, 2));

    console.log('\nReport saved to: rss-optimized-report.json');
}

main().catch(console.error);
