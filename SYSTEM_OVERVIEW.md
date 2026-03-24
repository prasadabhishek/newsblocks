# 🏗️ NewsBlocks: System Overview

NewsBlocks is a high-gravity, visual news dashboard that transforms real-time global headlines into a semantic treemap. This document provides a deep technical dive into every layer of the system.

---

## 📂 Project Structure

```text
news-binary/
├── .github/workflows/   # CI/CD Automation (GitHub Actions)
├── public/              # Static assets and SEO sitemaps
├── scripts/             # Data Pipeline scripts (Scrapers & Generators)
├── src/
│   ├── components/      # React + D3.js Visualization components
│   ├── engine/          # Core Logic: AI, Clustering, & Scoring
│   │   ├── __tests__/   # Vitest unit test suite
│   │   ├── cache.json   # Persistent AI inference & embedding cache
│   │   ├── gemini.js    # AI Provider Abstraction (Gemini/Ollama/MiniMax)
│   │   └── pipeline.js  # Main orchestration logic
│   └── data.js          # The processed, live dataset for the UI
├── index.html           # Main entry point (Styles inlined for LCP optimization)
└── vitest.config.js     # Testing configuration
```

---

## ⚙️ How to Run

### **1. Development Mode**
To run the dashboard locally with hot-reloading:
```bash
npm install
npm run dev
# Dashboard available at http://localhost:5173
```

### **2. Running the Data Pipeline**
To manually trigger the AI news scraper and update `src/data.js`:
```bash
# Set your preferred provider (defaults to Gemini)
export AI_PROVIDER="ollama" 
node scripts/gather-news.js
```
*Note: Ensure Ollama is running if using the `ollama` provider.*

### **3. Production Build**
To generate the optimized static bundle:
```bash
npm run build
```

---

## 🧪 Testing Strategies

The system uses **Vitest** for all engine verification.
- **Run all tests:** `npm run test`
- **UI Mode:** `npm run test:ui`

### **Key Test Files**
- **`src/engine/__tests__/engine.test.js`**: Validates basic semantic clustering, sentiment bucketing, and RSS parsing logic.
- **`src/engine/__tests__/v4_engine.test.js`**: Tests the advanced **V4 Smart Signal Gate**, Tiered Source priority weighting, and AI Cache persistence (Warm vs. Cold cache runs).

---

### **What is tested?**
- **Clustering Logic**: Ensures Cosine Similarity correctly groups related headlines while maintaining high precision.
- **Sentiment Scoring**: Validates that AI buckets news into the correct sentiment categories (Strong Negative -> Strong Positive).
- **Signal Gate**: Verifies that Tier 1 sources (Reuters, BBC) pass implicitly while Tier 2 sources require higher consensus or importance scores.
- **Cache Integrity**: Ensures that the system correctly retrieves/stores embeddings and inferences to minimize API costs.

---

## 🧠 AI Architecture (The Engine)

NewsBlocks uses a multi-provider AI strategy handled by `src/engine/gemini.js`.

### **1. Providers**
- **Cloud (Gemini)**: `gemini-1.5-flash` for inference and `text-embedding-004` for vectors.
- **Local (Ollama)**: `llama3:8b` for inference and `nomic-embed-text` for vectors.
- **Failover (MiniMax)**: OpenAI-compatible endpoint as a secondary cloud fallback.

### **2. Semantic Clustering**
Instead of simple keyword matching, we use **Vector Embeddings**.
1. Headlines are converted into **768-dimensional vectors**.
2. We calculate the **Cosine Distance** between headlines.
3. If Similarity > **82%**, the headlines are grouped into a "Story Block."

### **3. Sentiment & Categorization**
The AI performs a two-pass analysis:
- **Pass 1**: Categorizes the story (Politics, Finance, Tech, etc.) and analyzes human impact.
- **Pass 2**: Synthesizes a representative, professional title and assigns a sentiment score bucketing:
  - `[-0.9] Strong Negative` (Major crises, disasters)
  - `[-0.4] Negative` (Policy conflicts, market drops)
  - `[0.0] Neutral` (Standard reporting)
  - `[0.4] Positive` (Scientific wins, growth)
  - `[0.9] Strong Positive` (Humanitarian breakthroughs)

---

## 🤖 GitHub Actions (Automation)

The project uses `.github/workflows/update-news.yml` for lifecycle management.

- **Schedule**: Historically programmed to run hourly during peak GMT/PST hours.
- **Action Steps**:
  1. Pulls latest `cache.json` (Git-as-a-DB strategy).
  2. Runs `gather-news.js` to process new headlines.
  3. Commits `src/data.js`, `cache.json`, and `sitemap.xml` back to the repo.
  4. Triggers **Cloudflare Pages** deployment via the Git hook.

---

## 🎨 How the Viz Works (Treemap Logic)

The frontend is a specialized implementation of **D3.js Treemapping**.
- **Data Heirarchy**: `Category` -> `Story Block` -> `Articles`.
- **Area Scaling**: Block size is determined by `citationCount` (consensus) and `relevance`.
- **D3 Transitions**: Uses a custom `.join()` pattern to animate blocks smoothly when filtering categories or resizing the screen.
- **Color Blind Mode**: Uses a persistent `localStorage` state to switch binary CSS/D3 scales between Red-Green and high-contrast Blue-Orange.

---

## 💎 Smart Signal & Filtering
The dashboard is not an "everything bucket." It hard-filters:
- **JUNK**: Gossip, sports (non-financial), and promotional content.
- **Low Signal**: Single-source Tier 2 stories with low relevance ( < 4/10).
- **Redundancy**: Semantic deduplication prevents the same event from appearing in multiple categories.
鼓
