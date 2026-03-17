import React, { useState, useEffect } from 'react';
import NewsTreemap from './components/NewsTreemap';
import { newsData } from './data';
import './App.css';

import { Github, Linkedin } from 'lucide-react';

function App() {
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth - 40 : 1000,
    height: typeof window !== 'undefined' ? window.innerHeight - 100 : 700
  });

  useEffect(() => {
    function handleResize() {
      const isMobile = window.innerWidth < 768;
      setDimensions({
        width: window.innerWidth - (isMobile ? 32 : 40),
        height: window.innerHeight - (isMobile ? 120 : 100)
      });
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Extract top stories for SEO & Schema
  const seoStories = [];
  if (newsData.children) {
    newsData.children.forEach(category => {
      if (category.children) {
        category.children.forEach(story => {
          seoStories.push({
            title: story.representativeTitle,
            url: story.rawArticles?.[0]?.link || "https://newsblocks.org/"
          });
        });
      }
    });
  }

  const jsonLdSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Top Global News Stories",
    "description": "Real-time AI clustered global news headlines.",
    "itemListElement": seoStories.slice(0, 30).map((story, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": story.url,
      "name": story.title
    }))
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col p-4">
      {/* Dynamic JSON-LD for Googlebot */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema) }}
      />

      {/* Semantic Screen-Reader/Crawler Feed */}
      <div className="sr-only">
        <h2>Latest Global News Headlines</h2>
        <ul>
          {seoStories.map((story, idx) => (
            <li key={idx}>
              <a href={story.url}>{story.title}</a>
            </li>
          ))}
        </ul>
      </div>

      <header className="header-main">
        <h1 className="logo-text">NewsBlocks</h1>
        <h2 className="subtitle-main">news sentiment visualizer</h2>

        <div className="last-updated-badge">
          <div className="last-updated-dot"></div>
          <span>LAST UPDATED: {newsData.lastUpdated ? new Date(newsData.lastUpdated).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }).toUpperCase() : 'JUST NOW'}</span>
        </div>

        <div className="sentiment-legend-container">
          <div className="sentiment-bar-wrapper">
            <span className="sentiment-label">NEGATIVE</span>
            <div className="sentiment-bar"></div>
            <span className="sentiment-label">POSITIVE</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex items-center justify-center">
        <NewsTreemap
          data={newsData}
          width={dimensions.width}
          height={dimensions.height}
        />
      </main>
      <footer className="footer-container">
        <details className="methodology-details">
          <summary className="methodology-summary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            Sources & Methodology
          </summary>
          <div className="methodology-content">
            <div className="methodology-section">
              <h3>Data Sources</h3>
              <p className="methodology-text" style={{ marginBottom: '12px' }}>
                AGGREGATED VIA <b>RSS FEEDS</b> FROM:
              </p>
              <ul className="methodology-list">
                <li><a href="https://www.theguardian.com/world/rss" target="_blank" rel="noopener noreferrer">The Guardian</a></li>
                <li><a href="http://feeds.bbci.co.uk/news/world/rss.xml" target="_blank" rel="noopener noreferrer">BBC News</a></li>
                <li><a href="http://www.politico.com/rss/politicopicks.xml" target="_blank" rel="noopener noreferrer">Politico</a></li>
                <li><a href="https://news.google.com/rss/search?q=US+Politics+government+when:1d&hl=en-US&gl=US&ceid=US:en" target="_blank" rel="noopener noreferrer">Google News</a></li>
                <li><a href="https://www.cnbc.com/id/10000664/device/rss/rss.html" target="_blank" rel="noopener noreferrer">CNBC Markets</a></li>
                <li><a href="https://finance.yahoo.com/news/rssindex" target="_blank" rel="noopener noreferrer">Yahoo Finance</a></li>
                <li><a href="http://feeds.marketwatch.com/marketwatch/topstories/" target="_blank" rel="noopener noreferrer">MarketWatch</a></li>
                <li><a href="https://www.ft.com/?format=rss" target="_blank" rel="noopener noreferrer">Financial Times</a></li>
                <li><a href="https://techcrunch.com/feed/" target="_blank" rel="noopener noreferrer">TechCrunch</a></li>
                <li><a href="https://www.theverge.com/rss/index.xml" target="_blank" rel="noopener noreferrer">The Verge</a></li>
                <li><a href="https://feeds.arstechnica.com/arstechnica/index" target="_blank" rel="noopener noreferrer">Ars Technica</a></li>
                <li><a href="https://www.technologyreview.com/feed/" target="_blank" rel="noopener noreferrer">MIT Tech Review</a></li>
                <li><a href="https://www.wired.com/feed/category/science/latest/rss" target="_blank" rel="noopener noreferrer">Wired</a></li>
                <li><a href="https://www.sciencedaily.com/rss/all.xml" target="_blank" rel="noopener noreferrer">Science Daily</a></li>
                <li><a href="https://www.nature.com/nature.rss" target="_blank" rel="noopener noreferrer">Nature</a></li>
                <li><a href="https://phys.org/rss-feed/" target="_blank" rel="noopener noreferrer">Phys.org</a></li>
              </ul>
            </div>
            <div className="methodology-section">
              <h3>AI Engine</h3>
              <p className="methodology-text">
                Real-time analysis powered by <b>Google Gemini 2.5 Flash</b> (with high-capacity fallback).
                Articles are semantically clustered into story-arcs and scored for sentiment using customized journalistic heuristics.
              </p>
            </div>
          </div>
        </details>

        <div className="social-links">
          <span className="made-by">Made by Abhishek Prasad</span>
          <a href="https://github.com/prasadabhishek" target="_blank" rel="noopener noreferrer" className="social-link">
            <Github size={14} />
            <span>GitHub</span>
          </a>
          <a href="https://www.linkedin.com/in/abhishekaprasad/" target="_blank" rel="noopener noreferrer" className="social-link">
            <Linkedin size={14} />
            <span>LinkedIn</span>
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;
