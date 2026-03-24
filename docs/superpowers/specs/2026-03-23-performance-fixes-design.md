# NewsBlocks Performance Fixes - Design Specification

**Date:** 2026-03-23
**Status:** Approved
**Type:** Technical Refactoring

---

## 1. Overview

Implement 8 HIGH-severity performance fixes for NewsBlocks to address sequential processing bottlenecks, unbounded cache growth, and testing gaps. All changes occur in a dedicated branch `feature/performance-fixes`.

---

## 2. Problems Addressed

| # | Issue | File | Impact |
|---|-------|------|--------|
| 1 | Sequential feed fetching (40s) | `scripts/gather-news.js` | 20 feeds × 2s sequential |
| 2 | O(n²) clustering algorithm | `src/engine/clustering.js` | 500 articles = 124,750 comparisons |
| 3 | Sequential embedding requests | `src/engine/gemini.js` | 50 headlines = 50 HTTP requests |
| 4 | Unbounded cache growth | `src/engine/cache.js` | Hundreds of MB over time |
| 5 | Static data export | `src/data.js` | AI pipeline blocks user access |
| 6 | No timeout on feed fetch | `scripts/gather-news.js` | Slow feeds block forever |
| 7 | Magic numbers throughout | Multiple files | Unmaintainable |
| 8 | Ollama fallback discards work | `src/engine/gemini.js` | Successful embeddings lost on failure |

---

## 3. Solution Components

### 3.1 Config Module (`src/engine/config.js`)

**Purpose:** Centralize all magic numbers for maintainability.

```javascript
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
```

### 3.2 Cache Manager Improvements (`src/engine/cache.js`)

**Changes:**
1. Debounced saves (5s window) instead of sync writes on every set
2. Size limit enforcement (100MB max)
3. Time-based eviction (feeds: 7 days, inferences/embeddings: 30 days)
4. Track `cachedAt` timestamp on each entry
5. Only save on process exit if pending writes

**Key Methods:**
- `_doSave()` - Internal async save with size check
- `_evictOldest(overage)` - LRU eviction when over size limit
- `prune()` - Enhanced to evict by age, not just inactivity

### 3.3 Parallel Feed Fetching (`scripts/gather-news.js`)

**Changes:**
1. Replace sequential `for` loop with `Promise.all` batches
2. Concurrency limit of 10 simultaneous feeds
3. Per-feed timeout (10s) via `Promise.race`
4. Graceful cache fallback on timeout

```javascript
async function fetchAllFeeds(feeds) {
    const CONCURRENCY = CONFIG.FEED_CONCURRENCY;
    const results = [];

    for (let i = 0; i < feeds.length; i += CONCURRENCY) {
        const batch = feeds.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
            batch.map(feed => fetchWithTimeout(feed, CONFIG.FEED_FETCH_TIMEOUT))
        );
        results.push(...batchResults);
    }
    return results;
}
```

### 3.4 Parallel Embeddings (`src/engine/gemini.js`)

**Changes:**
1. Ollama embeddings batched with concurrency=5
2. Error isolation - individual failures don't crash batch
3. On Ollama failure, only Gemini-fallback the failed ones
4. Remove hardcoded 500ms sleep before Gemini

```javascript
async tryOllamaEmbeddings(headlines, indices, hashes) {
    const results = new Array(headlines.length).fill(null);
    const CONCURRENCY = CONFIG.EMBEDDING_CONCURRENCY;

    for (let i = 0; i < headlines.length; i += CONCURRENCY) {
        const batch = headlines.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (h, j) => {
            try {
                const response = await axios.post(`${getOllamaHost()}/api/embeddings`, {
                    model: MODELS.OLLAMA_EMBED,
                    prompt: h
                });
                results[i + j] = response.data.embedding;
            } catch (e) {
                // Individual failure - null result, don't throw
            }
        }));
    }
    return results;
}
```

### 3.5 Clustering Optimization (`src/engine/clustering.js`)

**Changes:**
1. Import `CONFIG.SIMILARITY_THRESHOLD` instead of hardcoded `0.77`
2. Add spatial sort optimization (sort by embedding magnitude)
3. For datasets > 100 articles: skip similarity checks for items far apart in sorted order

```javascript
// Sort by magnitude - similar items cluster together
const sortedIndices = articles
    .map((_, i) => ({ i, mag: embeddings[i].reduce((s, v) => s + v*v, 0) }))
    .sort((a, b) => a.mag - b.mag)
    .map(x => x.i);

// Only compare to nearest 20 neighbors (skip if too far in sorted order)
for (let ii = 0; ii < sortedIndices.length; ii++) {
    for (let k = 1; k <= 20 && ii + k < sortedIndices.length; k++) {
        // Compare sortedIndices[ii] with sortedIndices[ii + k]
    }
}
```

### 3.6 Runtime Data API (Optional/Hybrid)

**Purpose:** Enable runtime data fetching to avoid blocking users during pipeline runs.

**Implementation:** Create lightweight API endpoint that:
- Returns cached data if fresh (< 15 min)
- Serves stale-while-revalidate pattern
- Falls back to static `src/data.js` if API unavailable

Note: Full implementation may be deferred if static-first architecture is intentional.

### 3.7 Timeout Helper (`src/engine/utils.js`)

**Add helper:**
```javascript
export async function withTimeout(promise, ms, name = 'operation') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout: ${name} exceeded ${ms}ms`)), ms)
        )
    ]);
}
```

---

## 4. Testing Strategy

### 4.1 Unit Tests (Vitest - Already Configured)

**Files to add/update:**
- `src/engine/__tests__/config.test.js` - Test CONFIG values
- `src/engine/__tests__/cache.test.js` - Test size limits, eviction
- `src/engine/__tests__/utils.test.js` - Test withTimeout helper

**Test Cases:**
| Component | Test |
|-----------|------|
| Cache | Evicts oldest when over 100MB, evicts feeds > 7 days |
| Cache | Debounce saves (verify no excessive writes) |
| Clustering | Same quality output with spatial sort optimization |
| Utils | withTimeout rejects on expiry, resolves on success |

### 4.2 E2E Tests (Playwright)

**Setup:**
```bash
npm install -D @playwright/test
npx playwright install chromium
```

**Test File:** `tests/e2e/performance-fixes.spec.js`

**Test Cases:**
| Test | Verification |
|------|-------------|
| Treemap renders | SVG exists, no console errors |
| Categories visible | World, Politics, Technology visible |
| Tooltip works | Hover shows story details |
| Mobile swipe | Swipe gestures navigate categories |
| Color blind toggle | Toggle changes colors |

**Run:**
```bash
# Start dev server in background
npm run dev &
sleep 5

# Run Playwright tests
npx playwright test tests/e2e/

# Kill dev server
pkill -f "vite"
```

---

## 5. Implementation Order

1. **Config module** - All fixes depend on this
2. **Utils enhancement** - withTimeout helper
3. **Cache improvements** - Debounce, size limits, eviction
4. **Parallel feeds** - Promise.all with concurrency
5. **Parallel embeddings** - Batched Ollama + error isolation
6. **Clustering optimization** - Spatial sort
7. **Tests** - Unit tests for new behavior
8. **E2E tests** - Playwright setup and tests

---

## 6. Files Changed

| File | Change Type |
|------|-------------|
| `src/engine/config.js` | New |
| `src/engine/cache.js` | Modified |
| `src/engine/gemini.js` | Modified |
| `src/engine/clustering.js` | Modified |
| `src/engine/utils.js` | Modified |
| `scripts/gather-news.js` | Modified |
| `src/engine/__tests__/config.test.js` | New |
| `src/engine/__tests__/cache.test.js` | Modified |
| `src/engine/__tests__/utils.test.js` | Modified |
| `tests/e2e/performance-fixes.spec.js` | New |
| `package.json` | Modified (add playwright) |

---

## 7. Success Criteria

- [ ] Feed fetching completes in < 10s (was 40s)
- [ ] Ollama embeddings complete in < 2s for 50 headlines (was 5s)
- [ ] Cache file never exceeds 100MB
- [ ] Slow feeds (10s+) don't block pipeline
- [ ] All unit tests pass
- [ ] Playwright E2E tests pass
- [ ] No console errors in browser
- [ ] Treemap renders correctly with all categories
