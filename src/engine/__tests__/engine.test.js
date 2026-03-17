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

    it('Performance: should process 100 articles in under 100ms', async () => {
        const rawData = [
            { name: 'Tech', rawArticles: Array(100).fill({ title: 'Standard news headline about tech', source: 'TechCrunch' }) }
        ];

        const start = performance.now();
        await pipeline.run(rawData);
        const end = performance.now();

        const duration = end - start;
        console.log(`Performance: 100 articles processed in ${duration.toFixed(2)}ms`);
        expect(duration).toBeLessThan(100);
    });

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

        // Should have exactly 2 clusters
        expect(worldCategory.children).toHaveLength(2);

        // Check sentiment accuracy
        const warStory = worldCategory.children.find(s =>
            s.representativeTitle.toLowerCase().includes('conflict') ||
            s.representativeTitle.toLowerCase().includes('war')
        );
        expect(warStory).toBeDefined();
        expect(warStory.sentiment).toBeLessThan(0);
    });

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

        // Expected slug: nvidia-the-gpu-king-of-silicon-valley
        expect(story.slug).toBe('nvidia-the-gpu-king-of-silicon-valley');
        expect(story.slug).not.toMatch(/[^a-z0-9-]/); // No special chars
    });

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
    });
});
