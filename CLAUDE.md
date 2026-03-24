# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server at http://localhost:5173
npm run build        # Production build to dist/
npm run lint         # ESLint checks
npm run test         # Vitest unit tests (headless)
npm run test:ui      # Vitest with interactive UI
node scripts/gather-news.js   # Run the news pipeline manually (requires .env with API keys)
```

## Architecture

### Data Flow (Pipeline)
```
RSS Feeds → gather-news.js → Pipeline.run() → src/data.js → React App → Treemap
                                  ↓
                        ClusteringEngine (embeddings)
                                  ↓
                        ScoringEngine (sentiment)
                                  ↓
                        Smart Signal Gate (filter)
```

### Engine Components (`src/engine/`)

- **`pipeline.js`** - Orchestrates the full pipeline. Creates category hierarchy, deduplicates stories via title hashing, applies Smart Signal Gate (Tier 1 always kept, Tier 2 requires consensus OR high relevance)
- **`clustering.js`** - Groups articles by semantic similarity using vector embeddings + cosine similarity. Falls back to Jaccard similarity (keyword overlap) if embeddings fail
- **`scoring.js`** - Calls AI to analyze sentiment (DISASTER/NEGATIVE/NEUTRAL/POSITIVE/EUPHORIC), relevance (1-10), and category. Also determines if a story is "hard news"
- **`gemini.js`** - Multi-provider AI abstraction. Supports:
  - Ollama (local): `llama3:8b` for inference, `nomic-embed-text` for embeddings
  - Gemini (cloud): `gemini-1.5-flash` for inference, `text-embedding-004` for vectors
  - MiniMax (failover): OpenAI-compatible endpoint
- **`cache.js`** - JSON file cache at `src/engine/cache.json`. Caches embeddings and inferences to reduce API costs. Uses `hashString()` for cache keys

### Frontend Components (`src/components/`)

- **`NewsTreemap.jsx`** - D3.js treemap for desktop. SVG-based with custom `.join()` pattern for transitions. Handles tooltip, color blind mode (localStorage), and deep linking via `/story/[slug]`
- **`MobileSwipeableTreemap.jsx`** - Swipeable category tabs for mobile. Shows one category at a time using the same treemap logic

### Data Structure (`src/data.js`)

```javascript
{
  name: "Top News",
  lastUpdated: "2026-03-22T19:09:51.586Z",
  children: [
    {
      name: "World",  // Category
      children: [
        {
          representativeTitle: "Headline",
          sources: ["BBC", "Reuters"],
          citationCount: 2,
          rawArticles: [...],
          sentiment: -0.9,  // -1 to +1
          relevance_score: 7,  // 1-10
          importance: 85,  // computed
          slug: "url-friendly-slug",
          aiCategory: "World"
        }
      ]
    }
  ]
}
```

### RSS Feed Sources (`scripts/gather-news.js`)

- `PREMIUM_FEEDS` array defines all RSS sources with tier (1 or 2) and category mapping
- Tier 1: Reuters, BBC, FT, Guardian, Nature, TechCrunch - high signal
- Tier 2: Yahoo Finance, MarketWatch, Ars Technica - require consensus or high relevance
- Google News feeds provide additional aggregation

## Key Implementation Notes

### Smart Signal Gate (Pipeline v4)
- Tier 1 sources always pass (elite publishers = high signal by default)
- Tier 2 sources require: citationCount > 1 (multi-source consensus) OR relevance >= 7
- Stories with `aiCategory === "JUNK"` are always dropped (sports, entertainment, gossip)

### Embedding Caching
- Uses MurmurHash3 variant via `hashString()` for cache keys
- Cache checked before any AI call - hit = instant return
- 60% cosine similarity threshold for clustering

### Treemap Rendering
- Block size = `citationCount * relevance` (consensus × importance)
- Color: sentiment scale from red (negative) to green (positive), blue-orange for color blind mode
- Tooltip shows all source articles on hover

### Environment Variables
```
GEMINI_API_KEY=      # Google AI API key
AI_PROVIDER=         # "ollama" (default) or "gemini" or "minimax"
OLLAMA_HOST=         # Ollama server (default: http://localhost:11434)
MINIMAX_API_KEY=     # MiniMax API key
```

## Performance Considerations

- Feed fetching is sequential by default - parallelization requires modification
- Cache saves are synchronous on every write - large cache files block
- Embeddings are processed sequentially - batch processing with concurrency is faster
- The 77% similarity threshold is tunable in `clustering.js`
