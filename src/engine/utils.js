import { jsonrepair } from 'jsonrepair';

/**
 * Retries an async function with exponential backoff or fixed delay.
 * @param {Function} fn - The async function to retry.
 * @param {number} retries - Max number of retries.
 * @param {number} delay - Delay between retries in ms.
 * @returns {Promise<any>}
 */
export async function retry(fn, retries = 3, delay = 30000) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            console.error(`Attempt ${i + 1} failed: ${e.message}. Retrying in ${delay}ms...`);
            if (i < retries - 1) await sleep(delay);
        }
    }
    throw lastError;
}

/**
 * Sleeps for a given duration.
 * @param {number} ms - Check milliseconds to sleep.
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simple string hashing for cache keys.
 */
export function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash.toString();
}

/**
 * Resilient JSON parsing for LLM outputs.
 * Handles markdown blocks, truncated JSON, and common syntax errors.
 */
export function robustParse(text) {
    if (!text) return null;

    // 1. Clean markdown code blocks if present
    let cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();

    // 2. Extract the first array or object if there's trailing/leading text
    const bracketMatch = cleaned.match(/[\{\[].*[\}\]]/s);
    if (bracketMatch) {
        cleaned = bracketMatch[0];
    }

    try {
        // 3. Attempt repair
        const repaired = jsonrepair(cleaned);
        // 4. Final parse
        return JSON.parse(repaired);
    } catch (e) {
        console.error("Robust parse failed even after repair:", e.message);
        console.error("Original text snippet:", text.substring(0, 100));
        return null;
    }
}
