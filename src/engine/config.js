/**
 * Centralized Configuration for NewsBlocks
 * All magic numbers are centralized here for maintainability.
 */

export const CONFIG = {
    // Clustering
    SIMILARITY_THRESHOLD: 0.77,
    JACCARD_THRESHOLD: 0.1,

    // Scoring
    SENTIMENT_BUCKETS: {
        DISASTER: -0.9,
        NEGATIVE: -0.4,
        NEUTRAL: 0.0,
        POSITIVE: 0.4,
        EUPHORIC: 0.9
    },

    // Limits
    MAX_ARTICLES_PER_FEED: 25,
    MIN_CATEGORIES_FOR_VALIDATION: 3,
    MOBILE_CULL_COUNT: 6,
    MAX_LINES_PRIMARY: 50,
    MAX_LINES_SECONDARY: 30,

    // Timeouts (ms)
    FEED_FETCH_TIMEOUT: 10000,
    AI_REQUEST_TIMEOUT: 30000,

    // Cache
    MAX_CACHE_SIZE_MB: 100,
    MAX_FEED_AGE_DAYS: 7,
    MAX_INFERENCE_AGE_DAYS: 30,
    MAX_EMBEDDING_AGE_DAYS: 30,

    // Concurrency
    FEED_CONCURRENCY: 10,
    EMBEDDING_CONCURRENCY: 5
};
