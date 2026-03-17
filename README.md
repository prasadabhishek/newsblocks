# 📰 NewsBlocks | Visual News Sentiment

[![Update News Map Data](https://github.com/prasadabhishek/newsblocks/actions/workflows/update-news.yml/badge.svg)](https://github.com/prasadabhishek/newsblocks/actions/workflows/update-news.yml)
[![Live Site](https://img.shields.io/badge/Live-newsblocks.org-blue)](https://newsblocks.org)

**NewsBlocks** is a real-time, AI-powered news sentiment visualizer. It aggregates global headlines from elite journalistic sources, clusters them into semantic story-arcs using high-dimensional embeddings, and projects them into a dynamic, interactive treemap.

![NewsBlocks Screenshot](public/screenshot.png)

## 🌐 The V3 Upgrade: Performance & Discoverability

The V3 milestone transforms NewsBlocks from a local interactive tool into a search-engine-optimized, high-gravity news platform.

### 🔗 Deep Linking & SPA Routing
- **Semantic Slugs:** The pipeline automatically generates human-readable URLs for every story (e.g., `/story/nvidia-shares-surge`).
- **State Restoration:** Refreshing a specific story URL restores the exact treemap state and reopens the relative tooltip.
- **History Support:** Full support for browser `Back` and `Forward` buttons.

### 🔍 SEO Content Powerhouse
- **Shadow Pages:** Automated generation of 200+ indexable HTML files for every story.
- **Sitemap:** Dynamic `sitemap.xml` updated every 8 hours.
- **Meta Tags:** Each story page includes unique Open Graph and Twitter tags for social sharing.
- **Branded Referrals:** All outgoing news links include `utm_source=newsblocks.org` to build referral authority with publishers.

### ⚡ Performance Overhaul
- **Forced Reflow Mitigation:** Moved all text measurement to an off-screen Canvas, eliminating the 100ms lag during window resizes.
- **Font Optimization:** Implemented preloading and font-display strategies to fix render-blocking delays.
- **Safari Cross-Browser Fix:** Resolved SVG clipping issues with baseline-relative text positioning.

## 🛠️ Tech Stack

- **Frontend:** React 19, Vite, D3.js (Advanced `.join()` transitions)
- **Styling:** Vanilla CSS with custom design tokens.
- **AI Engine:** Google Gemini 2.5 Flash + Google Embeddings.
- **SEO:** Automated 200+ Shadow Pages + Sitemap Generation.
- **Automation:** GitHub Actions (Running every 8 hours).
- **Deployment:** Cloudflare Pages (Automatic production builds).

## 🏃‍♂️ Running Locally

1. **Clone the repo:**
   ```bash
   git clone https://github.com/prasadabhishek/newsblocks.git
   cd newsblocks
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file in the root:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

4. **Run the pipeline (optional):**
   ```bash
   node scripts/gather-news.js
   ```

5. **Start the dev server:**
   ```bash
   npm run dev
   ```

## 🛡️ Security & Privacy
- **No Tracking:** NewsBlocks uses Cloudflare's privacy-first web analytics (No cookies, no GDPR banners needed).
- **Static First:** The site is served as a static asset. All AI processing happens in the background via secure GitHub Action runners, never exposing API keys to the client.

---
Made with ❤️ by [Abhishek Prasad](https://www.linkedin.com/in/abhishekaprasad/)
