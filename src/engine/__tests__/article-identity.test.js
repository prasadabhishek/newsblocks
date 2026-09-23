import { describe, expect, it, vi } from 'vitest';
import Parser from 'rss-parser';
import {
    canonicalizeArticleUrl,
    dedupeArticles,
    hasConsistentEvidence,
    isRecentArticle,
    normalizeFeedArticle,
    normalizePublisherName,
    storyEvidence
} from '../article-identity.js';
import { Pipeline } from '../pipeline.js';

const headline = 'Senate approves major infrastructure funding plan';
const directFeed = { publisher: 'NBC News', tier: 2 };
const googleFeed = { publisher: 'Google US', aggregator: 'Google News', tier: 2 };

function article(source, title = headline, category = 'US') {
    return {
        title,
        source,
        tier: 2,
        link: `https://${source.toLowerCase().replace(/\s+/g, '')}.example/news/${category.toLowerCase()}`,
        pubDate: new Date().toISOString()
    };
}

function testPipeline() {
    const pipeline = new Pipeline();
    vi.spyOn(pipeline.scoring, 'calculateScores').mockImplementation(async candidate => ({
        ...candidate,
        representativeTitle: headline,
        aiCategory: 'US',
        relevance_score: 5,
        importance: 30,
        sentiment: 0
    }));
    return pipeline;
}

describe('article identity and independent evidence', () => {
    it('reads the publisher from the real Google RSS field shape', async () => {
        const parser = new Parser({ customFields: { item: ['source'] } });
        const feed = await parser.parseString(
            '<rss version="2.0"><channel><title>Google News</title><item>' +
            '<title>Major policy announcement - The Guardian</title>' +
            '<link>https://news.google.com/rss/articles/123</link>' +
            '<pubDate>Wed, 23 Sep 2026 12:00:00 GMT</pubDate>' +
            '<source url="https://www.theguardian.com">The Guardian</source>' +
            '</item></channel></rss>'
        );
        expect(feed.items[0].source).toBe('The Guardian');
        expect(normalizeFeedArticle(googleFeed, feed.items[0]).publisher).toBe('The Guardian');
    });

    it('uses the original publisher from Google RSS, never its feed label', () => {
        const google = normalizeFeedArticle(googleFeed, {
            title: `${headline} - nbcnews.com`,
            source: 'nbcnews.com',
            link: 'https://news.google.com/rss/articles/abc?oc=5',
            isoDate: new Date().toISOString()
        });
        expect(google.title).toBe(headline);
        expect(google.publisher).toBe('NBC News');
        expect(google.source).toBe('NBC News');
        expect(google.aggregator).toBe('Google News');
        expect(google.canonicalUrl).toBeNull();
        expect(normalizeFeedArticle(googleFeed, {
            title: headline,
            link: 'https://news.google.com/rss/articles/unknown'
        })).toBeNull();
    });

    it('does not strip a meaningful hyphenated suffix from a direct feed title', () => {
        const title = 'Court rules on Smith - Jones dispute';
        expect(normalizeFeedArticle(directFeed, {
            title,
            link: 'https://www.nbcnews.com/story',
            isoDate: new Date().toISOString()
        }).title).toBe(title);
    });

    it('canonicalizes publisher aliases and article tracking URLs', () => {
        expect(normalizePublisherName('BBC World')).toBe('BBC');
        expect(normalizePublisherName('bbc.com')).toBe('BBC');
        expect(normalizePublisherName('WSJ')).toBe('Wall Street Journal');
        expect(normalizePublisherName('The Washington Post')).toBe('Washington Post');
        expect(normalizePublisherName('politico.eu')).toBe('Politico');
        expect(normalizePublisherName('Google World')).toBeNull();
        expect(normalizePublisherName('news.google.com')).toBeNull();
        expect(canonicalizeArticleUrl('https://example.com/news?id=4&utm_source=rss&fbclid=x#part'))
            .toBe('https://example.com/news?id=4');
        expect(canonicalizeArticleUrl('javascript:alert(1)')).toBeNull();
    });

    it('does not let expired cached articles or far-future dates corroborate news', () => {
        const now = Date.parse('2026-09-23T12:00:00Z');
        expect(isRecentArticle({ title: headline, pubDate: new Date(now - 23 * 3600000) }, now)).toBe(true);
        expect(isRecentArticle({ title: headline, pubDate: new Date(now - 25 * 3600000) }, now)).toBe(false);
        expect(isRecentArticle({ title: headline, pubDate: new Date(now + 3 * 3600000) }, now)).toBe(false);
    });

    it('prefers the publisher feed over Google and counts it once', () => {
        const direct = normalizeFeedArticle(directFeed, {
            title: headline,
            link: 'https://www.nbcnews.com/story?utm_source=rss',
            isoDate: new Date().toISOString()
        });
        const google = normalizeFeedArticle(googleFeed, {
            title: `${headline} - NBC News`,
            source: 'NBC News',
            link: 'https://news.google.com/rss/articles/abc',
            isoDate: new Date().toISOString()
        });
        const evidence = storyEvidence([google, direct, direct]);
        expect(evidence.rawArticles).toHaveLength(1);
        expect(evidence.rawArticles[0].link).toContain('nbcnews.com');
        expect(evidence.sources).toEqual(['NBC News']);
        expect(evidence.articleCount).toBe(1);
        expect(evidence.independentPublisherCount).toBe(1);
        expect(evidence.citationCount).toBe(1);
        expect(hasConsistentEvidence(evidence)).toBe(true);
        expect(hasConsistentEvidence({ ...evidence, citationCount: 2 })).toBe(false);
    });

    it('counts two genuinely different publishers but one BBC across feeds', () => {
        const evidence = storyEvidence([
            article('BBC World'),
            article('BBC US', 'Senate approves revised infrastructure funding plan'),
            article('NPR')
        ]);
        expect(evidence.sources).toEqual(['BBC', 'NPR']);
        expect(evidence.independentPublisherCount).toBe(2);
        expect(evidence.articleCount).toBe(3);
    });

    it('deduplicates identical canonical URLs despite different tracking parameters', () => {
        const original = article('NBC News');
        const copy = { ...article('Other News'), link: `${original.link}?utm_medium=rss` };
        expect(dedupeArticles([original, copy])).toHaveLength(1);
    });

    it('does not promote a copied tier-2 story as consensus', async () => {
        const pipeline = testPipeline();
        const direct = normalizeFeedArticle(directFeed, {
            title: headline,
            link: 'https://www.nbcnews.com/story',
            isoDate: new Date().toISOString()
        });
        const google = normalizeFeedArticle(googleFeed, {
            title: `${headline} - NBC News`,
            source: 'NBC News',
            link: 'https://news.google.com/rss/articles/abc',
            isoDate: new Date().toISOString()
        });
        const result = await pipeline.run([
            { name: 'US', rawArticles: [google] },
            { name: 'World', rawArticles: [direct] }
        ]);
        expect(result.children).toHaveLength(0);
        expect(pipeline.scoring.calculateScores).toHaveBeenCalledTimes(1);
    });

    it('promotes a tier-2 event with two independent publishers across categories', async () => {
        const pipeline = testPipeline();
        const result = await pipeline.run([
            { name: 'US', rawArticles: [article('NBC News')] },
            { name: 'World', rawArticles: [article('NPR')] }
        ]);
        const stories = result.children.flatMap(category => category.children);
        expect(stories).toHaveLength(1);
        expect(stories[0].sources).toEqual(['NBC News', 'NPR']);
        expect(stories[0].independentPublisherCount).toBe(2);
        expect(stories[0].citationCount).toBe(2);
        expect(stories[0].rawArticles).toHaveLength(2);
        expect(hasConsistentEvidence(stories[0])).toBe(true);
    });

    it('re-derives counts when two differently worded reports from one publisher merge', async () => {
        const pipeline = testPipeline();
        const result = await pipeline.run([
            { name: 'US', rawArticles: [article('Wired', 'Senate approves major infrastructure funding plan')] },
            { name: 'World', rawArticles: [article('Wired', 'Lawmakers pass new infrastructure spending package', 'World')] }
        ]);
        expect(pipeline.scoring.calculateScores).toHaveBeenCalledTimes(2);
        expect(result.children).toHaveLength(0);
    });
});
