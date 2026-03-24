import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retry, sleep, hashString, robustParse, withTimeout } from '../utils.js';

describe('Utils', () => {
    describe('retry', () => {
        it('should succeed on first attempt', async () => {
            const fn = vi.fn().mockResolvedValue('success');
            const result = await retry(fn, 3, 100);
            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should retry on failure and succeed', async () => {
            const fn = vi.fn()
                .mockRejectedValueOnce(new Error('fail'))
                .mockResolvedValue('success');
            const result = await retry(fn, 3, 100);
            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('should throw after all retries exhausted', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('always fail'));
            await expect(retry(fn, 3, 100)).rejects.toThrow('always fail');
            expect(fn).toHaveBeenCalledTimes(3);
        });
    });

    describe('sleep', () => {
        it('should sleep for the specified duration', async () => {
            const start = Date.now();
            await sleep(100);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(90);
            expect(elapsed).toBeLessThan(200);
        });
    });

    describe('hashString', () => {
        it('should produce consistent hashes', () => {
            const hash1 = hashString('test string');
            const hash2 = hashString('test string');
            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for different strings', () => {
            const hash1 = hashString('string a');
            const hash2 = hashString('string b');
            expect(hash1).not.toBe(hash2);
        });

        it('should produce numeric string hash', () => {
            const hash = hashString('test');
            expect(typeof hash).toBe('string');
            expect(hash).toMatch(/^-?\d+$/);
        });
    });

    describe('robustParse', () => {
        it('should parse valid JSON', () => {
            const result = robustParse('{"key": "value"}');
            expect(result).toEqual({ key: 'value' });
        });

        it('should repair truncated JSON with trailing text', () => {
            const result = robustParse('{"key": "value"} some trailing text');
            expect(result).toEqual({ key: 'value' });
        });

        it('should handle JSON with code blocks', () => {
            const result = robustParse('```json\n{"key": "value"}\n```');
            expect(result).toEqual({ key: 'value' });
        });

        it('should repair broken JSON', () => {
            const result = robustParse('{"key": "val"}');
            expect(result).toEqual({ key: 'val' });
        });

        it('should return null for invalid input', () => {
            expect(robustParse(null)).toBeNull();
            expect(robustParse('')).toBeNull();
        });
    });

    describe('withTimeout', () => {
        it('should resolve when promise resolves within timeout', async () => {
            const fastPromise = Promise.resolve('success');
            const result = await withTimeout(fastPromise, 5000, 'test');
            expect(result).toBe('success');
        });

        it('should reject when promise rejects within timeout', async () => {
            const failingPromise = Promise.reject(new Error('failure'));
            await expect(withTimeout(failingPromise, 5000, 'test')).rejects.toThrow('failure');
        });

        it('should reject with timeout error when exceeded', async () => {
            const slowPromise = new Promise(resolve => setTimeout(() => resolve('late'), 5000));
            await expect(withTimeout(slowPromise, 100, 'slowOp')).rejects.toThrow('Timeout: slowOp exceeded 100ms');
        });

        it('should use default name when not provided', async () => {
            const slowPromise = new Promise(resolve => setTimeout(() => resolve('late'), 5000));
            await expect(withTimeout(slowPromise, 50)).rejects.toThrow('Timeout: operation exceeded 50ms');
        });
    });
});
