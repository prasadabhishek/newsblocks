import { describe, it, expect } from 'vitest';
import { CONFIG } from '../config.js';

describe('CONFIG', () => {
    describe('Clustering', () => {
        it('should have SIMILARITY_THRESHOLD of 0.65', () => {
            expect(CONFIG.SIMILARITY_THRESHOLD).toBe(0.65);
        });

        it('should have JACCARD_THRESHOLD of 0.1', () => {
            expect(CONFIG.JACCARD_THRESHOLD).toBe(0.1);
        });
    });

    describe('Sentiment Buckets', () => {
        it('should have correct DISASTER bucket value', () => {
            expect(CONFIG.SENTIMENT_BUCKETS.DISASTER).toBe(-0.9);
        });

        it('should have correct NEGATIVE bucket value', () => {
            expect(CONFIG.SENTIMENT_BUCKETS.NEGATIVE).toBe(-0.4);
        });

        it('should have correct NEUTRAL bucket value', () => {
            expect(CONFIG.SENTIMENT_BUCKETS.NEUTRAL).toBe(0.0);
        });

        it('should have correct POSITIVE bucket value', () => {
            expect(CONFIG.SENTIMENT_BUCKETS.POSITIVE).toBe(0.4);
        });

        it('should have correct EUPHORIC bucket value', () => {
            expect(CONFIG.SENTIMENT_BUCKETS.EUPHORIC).toBe(0.9);
        });
    });

    describe('Limits', () => {
        it('should have MAX_ARTICLES_PER_FEED of 25', () => {
            expect(CONFIG.MAX_ARTICLES_PER_FEED).toBe(25);
        });

        it('should have MIN_CATEGORIES_FOR_VALIDATION of 3', () => {
            expect(CONFIG.MIN_CATEGORIES_FOR_VALIDATION).toBe(3);
        });

        it('should have MOBILE_CULL_COUNT of 6', () => {
            expect(CONFIG.MOBILE_CULL_COUNT).toBe(6);
        });

        it('should have MAX_LINES_PRIMARY of 50', () => {
            expect(CONFIG.MAX_LINES_PRIMARY).toBe(50);
        });

        it('should have MAX_LINES_SECONDARY of 30', () => {
            expect(CONFIG.MAX_LINES_SECONDARY).toBe(30);
        });
    });

    describe('Timeouts', () => {
        it('should have FEED_FETCH_TIMEOUT of 10000ms', () => {
            expect(CONFIG.FEED_FETCH_TIMEOUT).toBe(10000);
        });

        it('should have AI_REQUEST_TIMEOUT of 30000ms', () => {
            expect(CONFIG.AI_REQUEST_TIMEOUT).toBe(30000);
        });
    });

    describe('Cache', () => {
        it('should have MAX_CACHE_SIZE_MB of 100', () => {
            expect(CONFIG.MAX_CACHE_SIZE_MB).toBe(100);
        });

        it('should have MAX_FEED_AGE_DAYS of 7', () => {
            expect(CONFIG.MAX_FEED_AGE_DAYS).toBe(7);
        });

        it('should have MAX_INFERENCE_AGE_DAYS of 30', () => {
            expect(CONFIG.MAX_INFERENCE_AGE_DAYS).toBe(30);
        });

        it('should have MAX_EMBEDDING_AGE_DAYS of 30', () => {
            expect(CONFIG.MAX_EMBEDDING_AGE_DAYS).toBe(30);
        });
    });

    describe('Concurrency', () => {
        it('should have FEED_CONCURRENCY of 10', () => {
            expect(CONFIG.FEED_CONCURRENCY).toBe(10);
        });

        it('should have EMBEDDING_CONCURRENCY of 5', () => {
            expect(CONFIG.EMBEDDING_CONCURRENCY).toBe(5);
        });
    });
});
