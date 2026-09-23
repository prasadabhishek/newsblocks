import React, { useState, useEffect } from 'react';
import NewsTreemap from './components/NewsTreemap';
import MobileSwipeableTreemap from './components/MobileSwipeableTreemap';
import { newsData } from './data';

import { Github, Linkedin } from 'lucide-react';

function App() {
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth - 40 : 1000,
    height: typeof window !== 'undefined' ? window.innerHeight - 100 : 700
  });

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  // State for the currently selected story (from URL or click)
  const [selectedStory, setSelectedStory] = useState(null);
  const [missingStorySlug, setMissingStorySlug] = useState(null);

  // Accessibility: Color Blind Mode
  const [isColorBlind, setIsColorBlind] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('newsblocks_colorblind') === 'true';
    }
    return false;
  });

  const toggleColorBlind = () => {
    const newVal = !isColorBlind;
    setIsColorBlind(newVal);
    localStorage.setItem('newsblocks_colorblind', String(newVal));
  };

  useEffect(() => {
    function handleResize() {
      const mobileCheck = window.innerWidth < 768;
      setIsMobile(mobileCheck);
      setDimensions({
        width: window.innerWidth - (mobileCheck ? 32 : 40),
        height: window.innerHeight - (mobileCheck ? 120 : 100)
      });
    }

    // Deep Linking parser
    function parseSlug() {
      const path = window.location.pathname;
      if (path.startsWith('/story/')) {
        let slug = path.slice('/story/'.length).replace(/\/+$/, '');
        try {
          slug = decodeURIComponent(slug);
        } catch {
          setSelectedStory(null);
          setMissingStorySlug(slug);
          return;
        }
        let found = null;
        if (newsData.children) {
          newsData.children.forEach(cat => {
            if (cat.children) {
              const story = cat.children.find(s => s.slug === slug);
              if (story) found = story;
            }
          });
        }
        setSelectedStory(found);
        setMissingStorySlug(found ? null : slug);
      } else {
        setSelectedStory(null);
        setMissingStorySlug(null);
      }
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('popstate', parseSlug);

    // Initial parse
    parseSlug();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('popstate', parseSlug);
    };
  }, []);

  const handleStorySelect = (story) => {
    setSelectedStory(story);
    setMissingStorySlug(null);
    if (story && story.slug) {
      window.history.pushState(null, '', `/story/${story.slug}`);
    } else {
      window.history.pushState(null, '', '/');
    }
  };

  const updatedAt = newsData.lastUpdated ? new Date(newsData.lastUpdated) : null;
  const updatedAtMs = updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt.getTime() : null;
  const isStale = updatedAtMs === null || Date.now() - updatedAtMs > 12 * 60 * 60 * 1000;

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

      <header className="header-main" onClick={() => handleStorySelect(null)} style={{ cursor: 'pointer', position: 'relative' }}>
        {/* Color Blind Toggle */}
        <div 
          onClick={(e) => { e.stopPropagation(); toggleColorBlind(); }}
          style={{
            position: 'absolute',
            top: '24px',
            right: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            background: isColorBlind ? 'rgba(37, 99, 235, 0.2)' : 'rgba(30, 41, 59, 0.6)',
            border: `1px solid ${isColorBlind ? 'rgba(37, 99, 235, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
            borderRadius: '99px',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            zIndex: 50
          }}
          className="hover:scale-105"
        >
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: isColorBlind ? '#2563eb' : '#94a3b8',
            boxShadow: isColorBlind ? '0 0 8px #2563eb' : 'none'
          }}></div>
          <span style={{ 
            fontSize: '10px', 
            fontWeight: '900', 
            color: isColorBlind ? '#fff' : '#94a3b8',
            letterSpacing: '0.05em'
          }}>COLOR BLIND: {isColorBlind ? 'ON' : 'OFF'}</span>
        </div>

        <h1 className="logo-text">NewsBlocks</h1>
        <h2 className="subtitle-main">news sentiment visualizer</h2>

        <div className={`last-updated-badge ${isStale ? 'is-stale' : ''}`} role="status" aria-live="polite">
          <div className="last-updated-dot"></div>
          <span>{isStale ? 'STALE DATA · ' : ''}UPDATED: {updatedAtMs !== null ? updatedAt.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZoneName: 'short'
          }).toUpperCase() : 'TIME UNKNOWN'}</span>
        </div>

        <div className="sentiment-legend-container">
          <div className="sentiment-bar-wrapper">
            <span className="sentiment-label">{isColorBlind ? 'CRITICAL' : 'NEGATIVE'}</span>
            <div 
              className="sentiment-bar" 
              style={{ 
                background: isColorBlind
                  ? 'linear-gradient(to right, #2563eb 0%, #334155 50%, #ea580c 100%)'
                  : 'linear-gradient(to right, #ef4444 0%, #334155 50%, #22c55e 100%)' 
              }}
            ></div>
            <span className="sentiment-label">{isColorBlind ? 'RELEVANT' : 'POSITIVE'}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex items-center justify-center relative">
        {missingStorySlug ? (
          <section className="story-not-found" role="status">
            <h2>This story is no longer in the current news map.</h2>
            <p>NewsBlocks refreshes its story list as new coverage arrives.</p>
            <button type="button" onClick={() => handleStorySelect(null)}>Return to the news map</button>
          </section>
        ) : isMobile ? (
          <div className="w-full h-full bg-transparent overflow-hidden">
            <MobileSwipeableTreemap
              data={newsData}
              width={dimensions.width}
              height={dimensions.height}
              selectedStory={selectedStory}
              onStorySelect={handleStorySelect}
              isColorBlind={isColorBlind}
            />
          </div>
        ) : (
          <NewsTreemap
            data={newsData}
            width={dimensions.width}
            height={dimensions.height}
            selectedStory={selectedStory}
            onStorySelect={handleStorySelect}
            isColorBlind={isColorBlind}
          />
        )}
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
              <h3>Publisher evidence</h3>
              <p className="methodology-text" style={{ marginBottom: '12px' }}>
                Stories come from publisher RSS feeds and Google News discovery feeds. The count on each story is the number of distinct named publishers after duplicate articles are removed. Google News itself is not counted as a publisher. Open a story to inspect its article links.
              </p>
              <p className="methodology-text">Distinct publisher names do not always prove independent reporting; syndicated or shared wire coverage can still exist.</p>
            </div>
            <div className="methodology-section">
              <h3>AI Engine</h3>
              <p className="methodology-text">
                News is gathered from publisher RSS feeds, grouped into related stories, and scored for sentiment and relevance with a local AI model.
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
        </div>
      </footer>
    </div>
  );
}

export default App;
