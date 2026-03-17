import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScoringEngine } from '../scoring.js';
import { Pipeline } from '../pipeline.js';
import { Cache } from '../cache.js';
import fs from 'fs';

// Mock fs to avoid writing to real cache.json during tests
vi.mock('fs', async () => {
    const actual = await vi.importActual('fs');
    return {
        ...actual,
        default: {
            ...actual.default,
            writeFileSync: vi.fn(),
            existsSync: vi.fn(() => true),
            readFileSync: vi.fn(() => JSON.stringify({ feeds: {}, inference: {}, embeddings: {} }))
        }
    };
});

describe('V4 Strategy: Quality Over Quantity', () => {
    const scoring = new ScoringEngine();

    describe('isHardNews Heuristics', () => {
        it('should reject soft news or features', () => {
            const badTitles = [
                'Listen to our latest podcast on tech',
                'Analysis: Why the market might shift',
                'Opinion: My thoughts on the election',
                'Watch now: Video of the event',
                'The inside story of the breakthrough',
                'What is the future of AI?',
                'Ticker: AAPL price update'
            ];
            badTitles.forEach(title => {
                expect(scoring.isHardNews(title)).toBe(false);
            });
        });

        it('should allow hard news headlines', () => {
            const goodTitles = [
                'Fed raises interest rates by 25 basis points',
                'Nvidia hits $3 trillion market cap',
                'Global leaders meet for climate summit'
            ];
            goodTitles.forEach(title => {
                expect(scoring.isHardNews(title)).toBe(true);
            });
        });

        it('should reject very short titles', () => {
            expect(scoring.isHardNews('Stock Up')).toBe(false);
        });
    });

    describe('Source Tiering & Importance', () => {
        it('should properly calculate importance for Tier 1 sources', () => {
            // Tier 1 Cluster
            const tier1Cluster = {
                citationCount: 1,
                relevance_score: 10, // Max relevance
                sources: ['BBC'],
                rawArticles: [{ source: 'BBC', tier: 1 }]
            };
            // 1. relevanceBase = 10 * 5 = 50
            // 2. tierBonus = 1 * 10 = 10
            // 3. sourceVariety = 1 * 5 = 5
            // Total = 65

            const score = scoring.calculateImportance(tier1Cluster);
            expect(score).toBe(65);
        });

        it('should calculate lower importance for single-source Tier 2', () => {
            const tier2Cluster = {
                citationCount: 1,
                relevance_score: 5,
                sources: ['Niche Source'],
                rawArticles: [{ source: 'Niche Source', tier: 2 }]
            };
            // 1. relevanceBase = 5 * 5 = 25
            // 2. tierBonus = 0
            // 3. sourceVariety = 1 * 5 = 5
            // Total = 30

            const score = scoring.calculateImportance(tier2Cluster);
            expect(score).toBe(30);
        });

        it('should scale importance with relevance score', () => {
            const lowRel = { citationCount: 1, relevance_score: 3, sources: ['X'], rawArticles: [{ tier: 2 }] };
            const highRel = { citationCount: 1, relevance_score: 9, sources: ['X'], rawArticles: [{ tier: 2 }] };

            const s1 = scoring.calculateImportance(lowRel);
            const s2 = scoring.calculateImportance(highRel);

            expect(s2).toBeGreaterThan(s1);
        });
    });

    describe('Smart Signal Gate (Pipeline Logic)', () => {
        const pipeline = new Pipeline();

        it('should APPROVE single-source Tier 1 stories', async () => {
            const rawData = [{
                name: 'Politics',
                rawArticles: [{ title: 'Major BBC News Story', source: 'BBC', tier: 1 }]
            }];
            vi.spyOn(pipeline.scoring, 'calculateScores').mockResolvedValue({
                representativeTitle: 'Major BBC News Story',
                citationCount: 1,
                sources: ['BBC'],
                rawArticles: [{ source: 'BBC', tier: 1 }],
                relevance_score: 5,
                sentiment: 0
            });

            const result = await pipeline.run(rawData);
            expect(result.children[0].children).toHaveLength(1);
        });

        it('should DROP single-source low-relevance Tier 2 stories', async () => {
            const rawData = [{
                name: 'Tech',
                rawArticles: [{ title: 'Random Tech Blog Post', source: 'TechBlog', tier: 2 }]
            }];
            vi.spyOn(pipeline.scoring, 'calculateScores').mockResolvedValue({
                representativeTitle: 'Random Tech Blog Post',
                citationCount: 1,
                sources: ['TechBlog'],
                rawArticles: [{ source: 'TechBlog', tier: 2 }],
                relevance_score: 4,
                sentiment: 0
            });

            const result = await pipeline.run(rawData);
            expect(result.children[0].children).toHaveLength(0);
        });

        it('should APPROVE single-source high-relevance Tier 2 stories', async () => {
            const rawData = [{
                name: 'World',
                rawArticles: [{ title: 'Massive Sudden Breaking Event', source: 'LocalSource', tier: 2 }]
            }];
            vi.spyOn(pipeline.scoring, 'calculateScores').mockResolvedValue({
                representativeTitle: 'Massive Sudden Breaking Event',
                citationCount: 1,
                sources: ['LocalSource'],
                rawArticles: [{ source: 'LocalSource', tier: 2 }],
                relevance_score: 7, // High relevance
                sentiment: 0
            });

            const result = await pipeline.run(rawData);
            expect(result.children[0].children).toHaveLength(1);
        });
    });

    describe('CacheManager Persistence', () => {
        it('should handle embedding round-trips correctly', () => {
            const hash = 'test-hash-123';
            const vector = [0.1, 0.2, 0.3];

            Cache.setEmbedding(hash, vector);
            expect(Cache.getEmbedding(hash)).toEqual(vector);
        });

        it('should handle inference round-trips correctly', () => {
            const hash = 'inf-hash-456';
            const result = { sentiment: 'POSITIVE', relevance: 8, reasoning: 'Testing' };

            Cache.setInference(hash, result);
            expect(Cache.getInference(hash)).toEqual(result);
        });
    });
});
