import { ClusteringEngine } from './clustering.js';
import { ScoringEngine } from './scoring.js';
import { CONFIG } from './config.js';
import { dedupeArticles, publisherId, storyEvidence } from './article-identity.js';

const CATEGORY_NAMES = ['World', 'US', 'Stocks', 'Business', 'Technology', 'Science'];
const CATEGORY_ALIASES = { Politics: 'US', Finance: 'Business', Tech: 'Technology' };

function normalizeCategory(name, fallback = 'World') {
    if (CATEGORY_NAMES.includes(name)) return name;
    const alias = CATEGORY_ALIASES[name];
    return alias || (CATEGORY_NAMES.includes(fallback) ? fallback : 'World');
}

function latestArticleTime(cluster) {
    return Math.max(0, ...(cluster.rawArticles || []).map(article => {
        const publishedAt = Date.parse(article.pubDate || '');
        return Number.isFinite(publishedAt) ? publishedAt : 0;
    }));
}

function tierOnePublisherCount(articles) {
    return new Set(articles
        .filter(article => article.tier === 1)
        .map(article => article.publisherId || publisherId(article.publisher || article.source))
        .filter(Boolean)).size;
}

function candidatePriority(cluster, now) {
    const articles = cluster.rawArticles || [];
    const independentPublishers = cluster.independentPublisherCount ?? storyEvidence(articles).independentPublisherCount;
    const publishedAt = latestArticleTime(cluster);
    const ageHours = publishedAt ? Math.max(0, (now - publishedAt) / 3600000) : 48;
    const freshness = publishedAt ? Math.max(0, 24 - Math.min(24, ageHours)) : 0;

    // Prefer recent, independently corroborated stories from stronger publishers.
    return tierOnePublisherCount(articles) * 12 + independentPublishers * 8 + Math.min(articles.length, 5) * 2 + freshness;
}

function storyPriority(story, now) {
    const independentPublishers = story.independentPublisherCount ?? storyEvidence(story.rawArticles || []).independentPublisherCount;
    const publishedAt = latestArticleTime(story);
    const ageHours = publishedAt ? Math.max(0, (now - publishedAt) / 3600000) : 48;
    const freshness = publishedAt ? Math.max(0, 24 - Math.min(24, ageHours)) : 0;

    return (story.importance || 0) + independentPublishers * 4 + tierOnePublisherCount(story.rawArticles || []) * 3 + freshness;
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

        // Deduplicate across feeds and categories before clustering. Prefer the
        // publisher's own feed over an aggregator copy of the same article.
        const uniqueArticles = dedupeArticles(categoriesArray.flatMap(category =>
            category.rawArticles.map(article => ({ ...article, ingestionCategory: category.name }))
        )).filter(article => article.publisherId);
        const uniqueCategories = categoriesArray.map(category => ({
            ...category,
            rawArticles: uniqueArticles
                .filter(article => article.ingestionCategory === category.name)
                .map(article => {
                    const clean = { ...article };
                    delete clean.ingestionCategory;
                    return clean;
                })
        }));

        const clusteredCandidates = [];
        const now = Date.now();

        for (const cat of uniqueCategories) {
            const { name, rawArticles } = cat;
            console.log(`Clustering raw feed for: ${name}...`);
            const clusters = await this.clustering.cluster(rawArticles);
            clusteredCandidates.push(...clusters.map(cluster => ({ ...cluster, ingestionCategory: name })));
        }

        const selectedCandidates = selectCandidatePool(clusteredCandidates, uniqueCategories, now);
        console.log(`Scoring ${selectedCandidates.length} selected story candidates (cap ${CONFIG.MAX_CANDIDATES_TO_SCORE})...`);

        const seenStoryHashes = new Map();
        for (const c of selectedCandidates) {
            const scored = await this.scoring.calculateScores(c);
            if (!scored) continue;
            if (scored.aiCategory === 'JUNK') {
                console.log(`  └─ Dropping JUNK (Sports/Entertainment) story: ${scored.representativeTitle.substring(0, 50)}...`);
                continue;
            }

            Object.assign(scored, storyEvidence(scored.rawArticles || []));
            if (!scored.rawArticles.length) continue;
            const titleHash = scored.representativeTitle.toLowerCase().trim();
            if (seenStoryHashes.has(titleHash)) {
                const existing = seenStoryHashes.get(titleHash);
                Object.assign(existing, storyEvidence([...existing.rawArticles, ...scored.rawArticles]));
                existing.relevance_score = Math.max(existing.relevance_score || 0, scored.relevance_score || 0);
                existing.importance = this.scoring.calculateImportance(existing);
            } else {
                seenStoryHashes.set(titleHash, scored);
            }
        }

        // Apply the consensus gate only after cross-category merges, using the
        // number of distinct original publishers rather than article/feed labels.
        for (const scored of seenStoryHashes.values()) {
            const hasConsensus = scored.independentPublisherCount > 1;
            const isTier1 = tierOnePublisherCount(scored.rawArticles) > 0;
            const isHighRelevance = (scored.relevance_score || 0) >= 7;
            if (!isTier1 && !hasConsensus && !isHighRelevance) {
                console.log(`  └─ Dropping low-signal Tier 2 story: ${scored.representativeTitle.substring(0, 50)}...`);
                continue;
            }

            scored.slug = scored.representativeTitle
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .trim()
                .replace(/\s+/g, '-');

            const finalCat = normalizeCategory(scored.aiCategory, scored.ingestionCategory);
            root.children[catNameToIndex[finalCat]].children.push(scored);
        }

        // Keep the strongest ~100 stories, with explicit room for each news section.
        root.children = limitPublishedStories(root.children);

        return root;
    }
}
