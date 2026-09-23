import { ClusteringEngine } from './clustering.js';
import { ScoringEngine } from './scoring.js';
import { CONFIG } from './config.js';

const CATEGORY_NAMES = ['World', 'US', 'Stocks', 'Business', 'Technology', 'Science'];

function latestArticleTime(cluster) {
    return Math.max(0, ...(cluster.rawArticles || []).map(article => {
        const publishedAt = Date.parse(article.pubDate || '');
        return Number.isFinite(publishedAt) ? publishedAt : 0;
    }));
}

function candidatePriority(cluster, now) {
    const articles = cluster.rawArticles || [];
    const sources = new Set(articles.map(article => article.source).filter(Boolean));
    const tierOneSources = new Set(articles
        .filter(article => article.tier === 1)
        .map(article => article.source)
        .filter(Boolean));
    const publishedAt = latestArticleTime(cluster);
    const ageHours = publishedAt ? Math.max(0, (now - publishedAt) / 3600000) : 48;
    const freshness = publishedAt ? Math.max(0, 24 - Math.min(24, ageHours)) : 0;

    // Prefer recent, independently corroborated stories from stronger publishers.
    return tierOneSources.size * 12 + sources.size * 8 + Math.min(articles.length, 5) * 2 + freshness;
}

function storyPriority(story, now) {
    const sources = new Set(story.sources || []);
    const tierOneSources = new Set((story.rawArticles || [])
        .filter(article => article.tier === 1)
        .map(article => article.source)
        .filter(Boolean));
    const publishedAt = latestArticleTime(story);
    const ageHours = publishedAt ? Math.max(0, (now - publishedAt) / 3600000) : 48;
    const freshness = publishedAt ? Math.max(0, 24 - Math.min(24, ageHours)) : 0;

    return (story.importance || 0) + sources.size * 4 + tierOneSources.size * 3 + freshness;
}

function selectCandidatePool(candidates, categoriesArray, now) {
    const ranked = candidates.sort((a, b) => candidatePriority(b, now) - candidatePriority(a, now));
    const selected = new Set();

    // Guarantee a varied candidate pool before using any remaining slots for global leaders.
    for (const category of categoriesArray) {
        const quota = CONFIG.CANDIDATE_QUOTAS[category.name] ?? 20;
        for (const candidate of ranked
            .filter(item => item.ingestionCategory === category.name)
            .slice(0, quota)) {
            if (selected.size >= CONFIG.MAX_CANDIDATES_TO_SCORE) break;
            selected.add(candidate);
        }
    }
    for (const candidate of ranked) {
        if (selected.size >= CONFIG.MAX_CANDIDATES_TO_SCORE) break;
        selected.add(candidate);
    }
    return [...selected];
}

function limitPublishedStories(categories) {
    const now = Date.now();
    const ranked = categories.flatMap(category => category.children.map(story => ({
        category: category.name,
        story,
        priority: storyPriority(story, now)
    })));
    const selected = [];
    const selectedStories = new Set();

    // Reserve space for every section first, so one busy feed cannot crowd out the rest.
    for (const categoryName of CATEGORY_NAMES) {
        const categoryStories = ranked
            .filter(entry => entry.category === categoryName)
            .sort((a, b) => b.priority - a.priority);
        const quota = CONFIG.STORY_CATEGORY_QUOTAS[categoryName];
        for (const entry of categoryStories.slice(0, quota)) {
            selected.push(entry);
            selectedStories.add(entry.story);
        }
    }

    // If a section has too few good stories, use the empty slots for the next-best stories.
    for (const entry of ranked.sort((a, b) => b.priority - a.priority)) {
        if (selected.length >= CONFIG.MAX_STORIES) break;
        if (selectedStories.has(entry.story)) continue;
        selected.push(entry);
        selectedStories.add(entry.story);
    }

    for (const category of categories) {
        category.children = selected
            .filter(entry => entry.category === category.name)
            .sort((a, b) => b.priority - a.priority)
            .map(entry => entry.story);
    }
    return categories.filter(category => category.children.length > 0);
}

export class Pipeline {
    constructor() {
        this.clustering = new ClusteringEngine();
        this.scoring = new ScoringEngine();
    }

    async run(categoriesArray) {
        const root = {
            name: "Top News",
            lastUpdated: new Date().toISOString(),
            children: [
                { name: "World", children: [] },
                { name: "US", children: [] },
                { name: "Stocks", children: [] },
                { name: "Business", children: [] },
                { name: "Technology", children: [] },
                { name: "Science", children: [] }
            ]
        };

        const catNameToIndex = {};
        root.children.forEach((c, i) => catNameToIndex[c.name] = i);

        const clusteredCandidates = [];
        const now = Date.now();

        for (const cat of categoriesArray) {
            const { name, rawArticles } = cat;
            console.log(`Clustering raw feed for: ${name}...`);
            const clusters = await this.clustering.cluster(rawArticles);
            clusteredCandidates.push(...clusters.map(cluster => ({ ...cluster, ingestionCategory: name })));
        }

        const selectedCandidates = selectCandidatePool(clusteredCandidates, categoriesArray, now);
        console.log(`Scoring ${selectedCandidates.length} selected story candidates (cap ${CONFIG.MAX_CANDIDATES_TO_SCORE})...`);

        const seenStoryHashes = new Map(); // hash -> { catIndex, childIndex }
        for (const c of selectedCandidates) {
                const name = c.ingestionCategory;
                const scored = await this.scoring.calculateScores(c);
                if (scored) {
                    // --- V4.6 TABLOID FILTER ---
                    if (scored.aiCategory === "JUNK") {
                        console.log(`  └─ Dropping JUNK (Sports/Entertainment) story: ${scored.representativeTitle.substring(0, 50)}...`);
                        continue;
                    }

                    // --- V4 SMART CONSENSUS GATE ---
                    const hasConsensus = scored.citationCount > 1;
                    const isTier1 = scored.rawArticles.some(a => a.tier === 1);
                    const isHighRelevance = (scored.relevance_score || 0) >= 7;

                    // 1. Always keep Tier 1 stories (Elite publishers are high-signal by default)
                    // 2. Keep Tier 2 stories ONLY if they have consensus OR high relevance.
                    if (!isTier1 && !hasConsensus && !isHighRelevance) {
                        console.log(`  └─ Dropping low-signal Tier 2 story: ${scored.representativeTitle.substring(0, 50)}...`);
                        continue;
                    }
                    // --------------------------

                    const titleHash = scored.representativeTitle.toLowerCase().trim();

                    if (seenStoryHashes.has(titleHash)) {
                        // Deduplicate: Merge sources and articles into the existing node
                        const pos = seenStoryHashes.get(titleHash);
                        const existing = root.children[pos.catIndex].children[pos.childIndex];

                        existing.sources = [...new Set([...existing.sources, ...scored.sources])];
                        existing.citationCount += scored.citationCount;
                        existing.rawArticles = [...existing.rawArticles, ...scored.rawArticles];

                        // Recalculate importance based on merged data
                        existing.importance = this.scoring.calculateImportance(existing);
                    } else {
                        // Create a URL-friendly slug
                        scored.slug = scored.representativeTitle
                            .toLowerCase()
                            .replace(/[^a-z0-9\s-]/g, '') // remove special chars
                            .trim()
                            .replace(/\s+/g, '-');        // replace spaces with hyphens

                        // V4.6 Route to AI-determined category
                        let finalCat = scored.aiCategory;
                        if (!catNameToIndex.hasOwnProperty(finalCat)) {
                            // If the model returns an unsupported category, keep the feed's category.
                            finalCat = scored.ingestionCategory || "World";
                        }
                        
                        const targetCatIndex = catNameToIndex[finalCat];
                        const destArray = root.children[targetCatIndex].children;

                        seenStoryHashes.set(titleHash, {
                            catIndex: targetCatIndex,
                            childIndex: destArray.length
                        });
                        destArray.push(scored);
                    }
                }
        }

        // Keep the strongest ~100 stories, with explicit room for each news section.
        root.children = limitPublishedStories(root.children);

        return root;
    }
}
