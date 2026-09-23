import { describe, it, expect, vi } from 'vitest';
import { Pipeline } from '../pipeline.js';

describe('Pipeline publication limits', () => {
    it('scores a balanced candidate pool and publishes at most 100 ranked stories', async () => {
        const pipeline = new Pipeline();
        const categories = ['World', 'US', 'Stocks', 'Business', 'Technology', 'Science'];
        const rawData = categories.map(name => ({
            name,
            rawArticles: Array.from({ length: 40 }, (_, index) => ({
                title: `${name} event ${index} headline`,
                source: `${name} Publisher ${index}`,
                tier: 1,
                pubDate: new Date().toISOString(),
                link: `https://example.com/${name.toLowerCase()}/${index}`
            }))
        }));

        vi.spyOn(pipeline.clustering, 'cluster').mockImplementation(async articles => articles.map(article => ({
            representativeTitle: article.title,
            sources: [article.source],
            citationCount: 1,
            rawArticles: [article]
        })));
        const score = vi.spyOn(pipeline.scoring, 'calculateScores').mockImplementation(async candidate => ({
            ...candidate,
            aiCategory: candidate.ingestionCategory,
            relevance_score: 10,
            importance: 65,
            sentiment: 0
        }));

        const result = await pipeline.run(rawData);
        const storyCount = result.children.reduce((total, category) => total + category.children.length, 0);

        expect(score).toHaveBeenCalledTimes(120);
        expect(storyCount).toBe(100);
        expect(Object.fromEntries(result.children.map(category => [category.name, category.children.length]))).toEqual({
            World: 22,
            US: 22,
            Stocks: 14,
            Business: 14,
            Technology: 14,
            Science: 14
        });
    });

    it('routes legacy feed category aliases into supported sections', async () => {
        const pipeline = new Pipeline();
        vi.spyOn(pipeline.clustering, 'cluster').mockResolvedValue([{
            representativeTitle: 'Major Political Policy Changes',
            sources: ['BBC'],
            citationCount: 1,
            rawArticles: [{ title: 'Major Political Policy Changes', source: 'BBC', tier: 1 }]
        }]);
        vi.spyOn(pipeline.scoring, 'calculateScores').mockImplementation(async candidate => ({
            ...candidate,
            aiCategory: 'Politics',
            relevance_score: 8,
            importance: 55,
            sentiment: 0
        }));

        const result = await pipeline.run([{ name: 'Politics', rawArticles: [{}] }]);
        expect(result.children).toHaveLength(1);
        expect(result.children[0].name).toBe('US');
        expect(result.children[0].children).toHaveLength(1);
    });
});
