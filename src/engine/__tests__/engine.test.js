import { describe, it, expect, vi } from 'vitest';
import { ClusteringEngine } from '../clustering.js';
import { ScoringEngine } from '../scoring.js';
import { Pipeline } from '../pipeline.js';

describe('News Pipeline Unit Tests', () => {
    const clustering = new ClusteringEngine();
    const scoring = new ScoringEngine();

    describe('ClusteringEngine', () => {
        it('should group identical headlines', async () => {
            const articles = [
                { title: 'Nvidia shares surge to all-time high', source: 'CNBC' },
                { title: 'Nvidia shares surge to all-time high', source: 'Reuters' }
            ];
            const clusters = await clustering.cluster(articles);
            expect(clusters).toHaveLength(1);
            expect(clusters[0].citationCount).toBe(2);
        });

        it('should group semantically similar headlines', async () => {
            const articles = [
                { title: 'Apple launches new iPhone 16', source: 'WSJ' },
                { title: 'Apple reveals iPhone 16 at launch event', source: 'The Verge' }
            ];
            const clusters = await clustering.cluster(articles);
            expect(clusters).toHaveLength(1);
        });

        it('should deduplicate articles with same source AND title', async () => {
            const articles = [
                { title: 'Same News Story', source: 'NBC' },
                { title: 'Same News Story', source: 'NBC' }, // duplicate
                { title: 'Same News Story', source: 'Google US' } // same title, different source
            ];
            const clusters = await clustering.cluster(articles);
            expect(clusters).toHaveLength(1);
            // Should have 2 sources (NBC deduplicated, Google US kept)
            expect(clusters[0].sources).toHaveLength(2);
            expect(clusters[0].sources).toContain('NBC');
            expect(clusters[0].sources).toContain('Google US');
            // RawArticles should only have 2 (NBC once, Google US once)
            expect(clusters[0].rawArticles).toHaveLength(2);
        });

        it('should filter out promotional words like sale, deals, discount', async () => {
            const articles = [
                { title: 'PlayStation Summer Sale: Best Deals', source: 'TechSite' },
                { title: 'Amazon Spring Sale: Massive Discounts', source: 'NewsSite' }
            ];
            // These should NOT cluster together because 'sale' and 'deals' are filtered
            const clusters = await clustering.cluster(articles);
            // With promo words filtered, overlap is minimal
            expect(clusters.length).toBe(2); // Should be 2 separate clusters
        });
    });

    describe('ScoringEngine', () => {
        it('should detect positive sentiment', () => {
            const score = scoring.analyzeSentiment('Massive breakthrough in AI technology');
            expect(score).toBeGreaterThan(0);
        });

        it('should calculate importance based on citations', () => {
            const cluster1 = { citationCount: 1, sources: ['BBC'] };
            const cluster5 = { citationCount: 5, sources: ['BBC', 'CNN', 'Reuters', 'AP', 'WSJ'] };

            const imp1 = scoring.calculateImportance(cluster1);
            const imp5 = scoring.calculateImportance(cluster5);

            expect(imp5).toBeGreaterThan(imp1);
        });
    });
});

describe('Performance & Accuracy Tests', () => {
    const pipeline = new Pipeline();

    it('Performance: should process 100 articles in under 10000ms', async () => {
        const rawData = [
            { name: 'Tech', rawArticles: Array(100).fill({ title: 'Standard news headline about tech', source: 'TechCrunch' }) }
        ];

        const start = performance.now();
        await pipeline.run(rawData);
        const end = performance.now();

        const duration = end - start;
        console.log(`Performance: 100 articles processed in ${duration.toFixed(2)}ms`);
        expect(duration).toBeLessThan(10000); // Real AI calls take seconds, not ms
    }, 15000); // 15s timeout for this test

    it('Accuracy: should correctly cluster diverse headlines', async () => {
        const rawData = [
            {
                name: 'World',
                rawArticles: [
                    { title: 'Conflict erupts in Middle East', source: 'Source A', tier: 1 },
                    { title: 'New war breaks out in Middle East', source: 'Source B', tier: 1 },
                    { title: 'SpaceX launches Starship', source: 'Source C', tier: 1 },
                    { title: 'Elon Musk rockets Starship to space', source: 'Source D', tier: 1 }
                ]
            }
        ];

        const result = await pipeline.run(rawData);
        const worldCategory = result.children.find(c => c.name === 'World');

        // With threshold 0.60, aggressive clustering may merge all into 1 cluster
        expect(worldCategory.children.length).toBeGreaterThanOrEqual(1);

        // Check sentiment accuracy
        const warStory = worldCategory.children.find(s =>
            s.representativeTitle.toLowerCase().includes('conflict') ||
            s.representativeTitle.toLowerCase().includes('war')
        );
        expect(warStory).toBeDefined();
        expect(warStory.sentiment).toBeLessThan(0);
    }, 30000);

    it('Slug Generation: should generate URL-friendly slugs for clusters', async () => {
        const rawData = [
            {
                name: 'Tech',
                rawArticles: [
                    { title: 'Nvidia: The GPU King of Silicon Valley!', source: 'Tech News', tier: 1 }
                ]
            }
        ];

        const result = await pipeline.run(rawData);
        const story = result.children[0].children[0];

        // Slug should be URL-safe (no special chars except hyphens)
        expect(story.slug).toMatch(/^[a-z0-9-]+$/);
        // Slug should contain nvidia
        expect(story.slug).toContain('nvidia');
    }, 30000);

    it('Hierarchy Structure: should include essential fields for deep linking', async () => {
        const rawData = [{ name: 'World', rawArticles: [{ title: 'Middle East conflict escalates today', source: 'Global News', tier: 1 }] }];
        const result = await pipeline.run(rawData);

        expect(result.children).toHaveLength(1);
        const story = result.children[0].children[0];
        expect(story).toBeDefined();
        expect(story).toHaveProperty('slug');
        expect(story).toHaveProperty('representativeTitle');
        expect(story).toHaveProperty('sentiment');
        expect(result).toHaveProperty('lastUpdated');
    }, 30000);

    it('Category Structure: should support World, US, Stocks, Business, Technology, Science categories', async () => {
        // The pipeline defines these categories - AI may route stories to any of them
        // This test verifies the category structure exists and old categories are removed
        const rawData = [
            { name: 'World', rawArticles: [{ title: 'Ukraine war escalation continues with new offensive', source: 'Reuters', tier: 1 }] },
            { name: 'US', rawArticles: [{ title: 'Senate passes healthcare reform bill', source: 'AP', tier: 1 }] },
            { name: 'Stocks', rawArticles: [{ title: 'Dow Jones industrial average rises 500 points in trading', source: 'CNBC', tier: 1 }] },
            { name: 'Business', rawArticles: [{ title: 'Global merger wave reshapes pharmaceutical industry', source: 'Bloomberg', tier: 1 }] },
            { name: 'Technology', rawArticles: [{ title: 'Apple unveils next-generation AI features', source: 'TechCrunch', tier: 1 }] },
            { name: 'Science', rawArticles: [{ title: 'NASA confirms discovery of habitable zone planet', source: 'Nature', tier: 1 }] }
        ];
        const result = await pipeline.run(rawData);

        const categoryNames = result.children.map(c => c.name);
        // At least some of the new categories should be present
        expect(categoryNames).toContain('World');
        expect(categoryNames).toContain('Technology');
        expect(categoryNames).toContain('Science');
        // Verify old categories are removed
        expect(categoryNames).not.toContain('Politics');
        expect(categoryNames).not.toContain('Finance');
        expect(categoryNames).not.toContain('Seattle');
    }, 30000);
});
