/**
 * RSS Feed Quality Analyzer
 *
 * Tests RSS feeds for:
 * 1. Accessibility (200 OK, no 403/404 errors)
 * 2. Article freshness (recent articles)
 * 3. Feed quality (properly formatted, not empty)
 * 4. Content signal (titles, descriptions, proper metadata)
 *
 * Run with: node scripts/experiment-rss-feeds.js
 */

import Parser from 'rss-parser';
import { writeFileSync } from 'fs';
import { CONFIG } from '../src/engine/config.js';

const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    },
    timeout: 10000,
    customFields: {
        item: ['media:content', 'media:thumbnail', 'content:encoded']
    }
});

// Categories to test
const CATEGORIES = {
    'Politics': [
        'https://www.theguardian.com/politics/rss',
        'http://feeds.bbci.co.uk/news/politics/rss.xml',
        'https://www.politico.com/rss/politicopicks.xml',
        'https://news.google.com/rss/search?q=US+Politics+government+when:1d&hl=en-US&gl=US&ceid=US:en',
    ],
    'World': [
        'http://feeds.bbci.co.uk/news/world/rss.xml',
        'https://www.theguardian.com/world/rss',
        'https://www.aljazeera.com/xml/rss/all.xml',
        'https://www.reutersagency.com/feed/',
    ],
    'Technology': [
        'https://techcrunch.com/feed/',
        'https://www.theverge.com/rss/index.xml',
        'https://feeds.arstechnica.com/arstechnica/index',
        'https://www.technologyreview.com/feed/',
        'https://www.wired.com/feed/rss',
    ],
    'Science': [
        'https://www.wired.com/feed/category/science/latest/rss',
        'https://www.sciencedaily.com/rss/all.xml',
        'https://www.nature.com/nature.rss',
        'https://phys.org/rss-feed/',
        'https://www.theguardian.com/science/rss',
    ],
    'Finance': [
        'https://www.cnbc.com/id/10000664/device/rss/rss.html',
        'https://finance.yahoo.com/news/rssindex',
        'http://feeds.marketwatch.com/marketwatch/topstories/',
        'https://www.cnbc.com/id/10001147/device/rss/rss.html',
        'https://www.ft.com/?format=rss',
        'https://www.wsj.com/xml/rss/3_7085.xml',
    ],
    'US': [
        'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
        'https://rss.nytimes.com/services/xml/rss/nyt/Americas.xml',
        'https://feeds.washingtonpost.com/rss/national',
    ],
    'Seattle': [
        'https://www.seattletimes.com/feed/politics/',
        'https://www.seattletimes.com/feed/news/',
        'https://komonews.com/feed',
    ]
};

// New feeds to test (opinion/editorial focused)
const NEW_FEEDS_TO_TEST = [
    // Opinion/Editorial
    { name: 'Reuters Opinion', url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best', category: 'Opinion' },
    { name: 'The Atlantic', url: 'https://www.theatlantic.com/feed/all/', category: 'Opinion' },
    { name: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/', category: 'Opinion' },
    { name: 'The Nation', url: 'https://www.thenation.com/feed/', category: 'Opinion' },
    { name: 'The New Yorker', url: 'https://www.newyorker.com/feed/rss', category: 'Opinion' },
    { name: 'The Guardian Opinion', url: 'https://www.theguardian.com/commentisfree/rss', category: 'Opinion' },
    { name: 'NY Times Opinion', url: 'https://www.nytimes.com/services/xml/rss/nyt/Opinion.xml', category: 'Opinion' },
    { name: 'Washington Post Opinions', url: 'https://feeds.washingtonpost.com/rss/opinions', category: 'Opinion' },
    { name: 'The Economist Letters', url: 'https://www.economist.com/rss/letters/rssComments.xml', category: 'Opinion' },
    { name: 'The Hill Opinion', url: 'https://thehill.com/opinion/feed/', category: 'Opinion' },
    { name: 'Politico Opinion', url: 'https://www.politico.com/rss/politicopicks.xml', category: 'Opinion' },

    // Additional World
    { name: 'AP News World', url: 'https://feeds.apnews.com/apnews/worldnews', category: 'World' },
    { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', category: 'World' },
    { name: 'ABC News', url: 'https://abcnews.go.com/abcnews/topstories/rss', category: 'World' },
    { name: 'CBS News', url: 'https://www.cbsnews.com/feed/', category: 'World' },
    { name: 'NBC News', url: 'https://www.nbcnews.com/rss', category: 'World' },

    // Additional Finance
    { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss', category: 'Finance' },
    { name: 'Bloomberg Tech', url: 'https://feeds.bloomberg.com/technology/news.rss', category: 'Technology' },
    { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews', category: 'Finance' },
    { name: 'Reuters Tech', url: 'https://feeds.reuters.com/reuters/technologyNews', category: 'Technology' },

    // Regional
    { name: 'Seattle Times Local', url: 'https://www.seattletimes.com/feed/politics/', category: 'Seattle' },
    { name: 'SeattlePI', url: 'https://www.seattlepi.com/rss/headlines.xml', category: 'Seattle' },
    { name: 'KUOW', url: 'https://kuow.org/feed', category: 'Seattle' },
    { name: 'Crosscut', url: 'https://crosscut.com/rss.xml', category: 'Seattle' },
];

async function testFeed(url, name, category) {
    const result = {
        name,
        url,
        category,
        accessible: false,
        statusCode: null,
        error: null,
        articleCount: 0,
        articles: [],
        freshArticles: 0,
        avgTitleLength: 0,
        hasDescriptions: 0,
        isEnglish: true,
        pubDates: []
    };

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    try {
        const response = await fetch(url, {
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

            // Check if blocked by checking for common block patterns
            if (text.includes('Access Denied') ||
                text.includes('403 Forbidden') ||
                text.includes('Please wait') ||
                text.includes('cloudflare') ||
                text.length < 500) {
                result.accessible = false;
                result.error = 'Possible blocking detected';
                return result;
            }

            // Parse the feed
            const feed = await parser.parseString(text);

            result.articleCount = feed.items?.length || 0;

            if (feed.items && feed.items.length > 0) {
                for (const item of feed.items.slice(0, 10)) {
                    const article = {
                        title: item.title || '',
                        link: item.link || '',
                        pubDate: item.pubDate || item.isoDate || null,
                        description: item.contentSnippet || item.content || item.summary || '',
                    };

                    // Check freshness
                    if (article.pubDate) {
                        const pubDate = new Date(article.pubDate);
                        result.pubDates.push(pubDate);
                        if (pubDate >= twentyFourHoursAgo) {
                            result.freshArticles++;
                        }
                    }

                    // Check description quality
                    if (article.description && article.description.length > 50) {
                        result.hasDescriptions++;
                    }

                    // Check title length (too short = low quality, too long = possibly bad parsing)
                    if (article.title) {
                        result.avgTitleLength += article.title.length;
                    }

                    result.articles.push(article);
                }

                if (result.articles.length > 0) {
                    result.avgTitleLength = result.avgTitleLength / result.articles.length;
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

async function analyzeFeed(result) {
    const score = {
        name: result.name,
        category: result.category,
        accessible: result.accessible,
        statusCode: result.statusCode,
        error: result.error,
        articleCount: result.articleCount,
        freshArticles: result.freshArticles,
        freshnessRate: result.articleCount > 0 ? (result.freshArticles / Math.min(result.articleCount, 10) * 100).toFixed(0) + '%' : '0%',
        avgTitleLength: result.avgTitleLength.toFixed(0),
        descriptionQuality: result.hasDescriptions,
        qualityScore: 0,
        recommendation: ''
    };

    // Calculate quality score
    let points = 0;

    if (!result.accessible) {
        score.qualityScore = 0;
        score.recommendation = 'DO NOT USE - Not accessible';
        return score;
    }

    // Accessible
    points += 25;

    // Has articles
    if (result.articleCount > 0) points += 15;
    if (result.articleCount > 10) points += 10;

    // Freshness
    const freshnessRate = result.articleCount > 0 ? result.freshArticles / Math.min(result.articleCount, 10) : 0;
    if (freshnessRate >= 0.5) points += 25;
    else if (freshnessRate >= 0.3) points += 15;
    else if (freshnessRate >= 0.1) points += 5;

    // Title quality
    if (result.avgTitleLength >= 50 && result.avgTitleLength <= 150) points += 15;
    else if (result.avgTitleLength > 0) points += 5;

    // Description quality
    if (result.hasDescriptions >= 5) points += 10;

    score.qualityScore = Math.min(points, 100);

    // Recommendation
    if (score.qualityScore >= 70) {
        score.recommendation = 'RECOMMENDED - Good quality feed';
    } else if (score.qualityScore >= 50) {
        score.recommendation = 'CONSIDER - Acceptable but not top tier';
    } else if (result.accessible) {
        score.recommendation = 'USE WITH CAUTION - Quality concerns';
    }

    return score;
}

async function main() {
    console.log('RSS Feed Quality Analyzer');
    console.log('========================\n');

    const allResults = [];
    const newFeedResults = [];

    // Test current feeds
    console.log('Testing CURRENT feeds by category...\n');

    for (const [category, feeds] of Object.entries(CATEGORIES)) {
        console.log(`\n${category}:`);
        for (const url of feeds) {
            const result = await testFeed(url, url.split('/')[2] || url, category);
            allResults.push(result);
            const analysis = await analyzeFeed(result);
            console.log(`  ${analysis.accessible ? '✓' : '✗'} ${result.name || 'feed'}: ${analysis.statusCode || 'error'} - ${analysis.recommendation}`);
            await new Promise(r => setTimeout(r, 500)); // Rate limit
        }
    }

    // Test new feeds
    console.log('\n\nTesting NEW feeds for expansion...\n');

    for (const feed of NEW_FEEDS_TO_TEST) {
        const result = await testFeed(feed.url, feed.name, feed.category);
        newFeedResults.push(result);
        const analysis = await analyzeFeed(result);
        const symbol = analysis.accessible ? '✓' : '✗';
        console.log(`  ${symbol} ${analysis.name}: ${analysis.statusCode || 'error'} - Fresh:${analysis.freshnessRate} - Score:${analysis.qualityScore} - ${analysis.recommendation}`);
        await new Promise(r => setTimeout(r, 500)); // Rate limit
    }

    // Generate report
    console.log('\n\n' + '='.repeat(80));
    console.log('RSS FEED QUALITY REPORT');
    console.log('='.repeat(80));

    // Summary by category
    console.log('\n\nCURRENT FEEDS BY CATEGORY:\n');
    const categorySummary = {};
    for (const result of allResults) {
        if (!categorySummary[result.category]) {
            categorySummary[result.category] = { total: 0, accessible: 0, fresh: 0 };
        }
        categorySummary[result.category].total++;
        if (result.accessible) categorySummary[result.category].accessible++;
        categorySummary[result.category].fresh += result.freshArticles;
    }

    for (const [cat, summary] of Object.entries(categorySummary)) {
        console.log(`${cat}: ${summary.accessible}/${summary.total} accessible, ${summary.fresh} fresh articles in last 24h`);
    }

    // New feeds summary
    console.log('\n\nNEW FEEDS TEST RESULTS:\n');
    const newFeedAnalysis = await Promise.all(newFeedResults.map(r => analyzeFeed(r)));
    const sorted = newFeedAnalysis.sort((a, b) => b.qualityScore - a.qualityScore);

    console.log('|' + 'Name'.padEnd(30) + '|' + 'Cat'.padEnd(12) + '|' + 'Status'.padEnd(8) + '|' + 'Fresh'.padEnd(8) + '|' + 'Score'.padEnd(6) + '|Recommendation'.padEnd(35) + '|');
    console.log('|' + '-'.repeat(30) + '|' + '-'.repeat(12) + '|' + '-'.repeat(8) + '|' + '-'.repeat(8) + '|' + '-'.repeat(6) + '|' + '-'.repeat(35) + '|');

    for (const feed of sorted) {
        console.log('|' +
            (feed.name || '').padEnd(30).substring(0, 30) + '|' +
            (feed.category || '').padEnd(12).substring(0, 12) + '|' +
            (feed.accessible ? '200' : (feed.statusCode || 'ERR')).toString().padEnd(8) + '|' +
            (feed.freshnessRate || '0%').padEnd(8) + '|' +
            (feed.qualityScore || 0).toString().padEnd(6) + '|' +
            (feed.recommendation || '').padEnd(35).substring(0, 35) + '|');
    }

    // Top recommendations
    console.log('\n\nTOP RECOMMENDATIONS FOR EXPANSION:\n');
    const recommended = sorted.filter(f => f.qualityScore >= 70 && f.accessible);
    if (recommended.length > 0) {
        for (const feed of recommended) {
            console.log(`✓ ${feed.name} (${feed.category}) - Score: ${feed.qualityScore}`);
        }
    } else {
        console.log('No feeds scored high enough for immediate recommendation.');
    }

    // Problems
    console.log('\n\nFEEDS WITH ISSUES:\n');
    const problematic = sorted.filter(f => !f.accessible || f.qualityScore < 50);
    for (const feed of problematic.slice(0, 10)) {
        console.log(`✗ ${feed.name}: ${feed.error || feed.recommendation}`);
    }

    // Save detailed report
    const report = {
        generated: new Date().toISOString(),
        currentFeeds: allResults,
        newFeeds: newFeedResults,
        analysis: newFeedAnalysis,
        summary: {
            currentByCategory: categorySummary,
            recommended: sorted.filter(f => f.qualityScore >= 70 && f.accessible),
            problematic: problematic
        }
    };

    writeFileSync('./rss-feed-report.json', JSON.stringify(report, null, 2));
    console.log('\n\nDetailed report saved to: rss-feed-report.json');
}

main().catch(console.error);
