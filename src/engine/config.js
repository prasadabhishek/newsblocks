/**
 * Centralized Configuration for NewsBlocks
 * All magic numbers are centralized here for maintainability.
 */

export const CONFIG = {
    // Clustering
    // JACCARD_THRESHOLD: Title word overlap threshold (0.25 = optimal balance)
    // Based on experiments: 0.25 gives 100% quality with reasonable clustering
    JACCARD_THRESHOLD: 0.25,

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
    // Keep the live map focused and bound the number of local-model calls per refresh.
    MAX_STORIES: 100,
    MAX_CANDIDATES_TO_SCORE: 120,
    CANDIDATE_QUOTAS: {
        World: 28,
        US: 26,
        Stocks: 16,
        Business: 18,
        Technology: 18,
        Science: 14
    },
    STORY_CATEGORY_QUOTAS: {
        World: 22,
        US: 22,
        Stocks: 14,
        Business: 14,
        Technology: 14,
        Science: 14
    },
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
