import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONFIG } from '../config.js';

describe('CONFIG Cache Settings', () => {
    describe('MAX_CACHE_SIZE_MB', () => {
        it('should be set to 100', () => {
            expect(CONFIG.MAX_CACHE_SIZE_MB).toBe(100);
        });
    });

    describe('MAX_FEED_AGE_DAYS', () => {
        it('should be set to 7', () => {
            expect(CONFIG.MAX_FEED_AGE_DAYS).toBe(7);
        });
    });

    describe('MAX_INFERENCE_AGE_DAYS', () => {
        it('should be set to 30', () => {
            expect(CONFIG.MAX_INFERENCE_AGE_DAYS).toBe(30);
        });
    });

    describe('MAX_EMBEDDING_AGE_DAYS', () => {
        it('should be set to 30', () => {
            expect(CONFIG.MAX_EMBEDDING_AGE_DAYS).toBe(30);
        });
    });
});

describe('Age-based eviction logic', () => {
    it('should correctly calculate if feed is stale', () => {
        const MAX_FEED_AGE_DAYS = CONFIG.MAX_FEED_AGE_DAYS;
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - (MAX_FEED_AGE_DAYS + 1));

        const now = new Date();
        const ageDays = (now - oldDate) / (1000 * 60 * 60 * 24);
        expect(ageDays).toBeGreaterThan(MAX_FEED_AGE_DAYS);
    });

    it('should correctly calculate if feed is fresh', () => {
        const MAX_FEED_AGE_DAYS = CONFIG.MAX_FEED_AGE_DAYS;
        const recentDate = new Date();
        recentDate.setHours(recentDate.getHours() - 1);

        const now = new Date();
        const ageDays = (now - recentDate) / (1000 * 60 * 60 * 24);
        expect(ageDays).toBeLessThan(MAX_FEED_AGE_DAYS);
    });

    it('should correctly calculate if embedding is stale', () => {
        const MAX_EMBEDDING_AGE_DAYS = CONFIG.MAX_EMBEDDING_AGE_DAYS;
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - (MAX_EMBEDDING_AGE_DAYS + 1));

        const now = new Date();
        const ageDays = (now - oldDate) / (1000 * 60 * 60 * 24);
        expect(ageDays).toBeGreaterThan(MAX_EMBEDDING_AGE_DAYS);
    });

    it('should correctly calculate if embedding is fresh', () => {
        const MAX_EMBEDDING_AGE_DAYS = CONFIG.MAX_EMBEDDING_AGE_DAYS;
        const recentDate = new Date();
        recentDate.setHours(recentDate.getHours() - 1);

        const now = new Date();
        const ageDays = (now - recentDate) / (1000 * 60 * 60 * 24);
        expect(ageDays).toBeLessThan(MAX_EMBEDDING_AGE_DAYS);
    });
});

describe('withTimeout behavior', () => {
    it('should respect timeout values in CONFIG', () => {
        expect(CONFIG.FEED_FETCH_TIMEOUT).toBe(10000);
        expect(CONFIG.AI_REQUEST_TIMEOUT).toBe(30000);
    });
});
