/**
 * Experiment: Compare clustering approaches
 *
 * Run with: node scripts/experiment-clustering.js
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDb } from '../src/engine/sqlite-cache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// DATA LOADING
// ============================================================

async function getAllArticles() {
    const db = getDb();
    const feedRows = db.prepare('SELECT key, value FROM cache WHERE type = ?').all('feed');

    const articles = [];
    for (const row of feedRows) {
        const data = JSON.parse(row.value);
        if (data.items && data.items.length > 0) {
            for (const item of data.items) {
                articles.push({
                    ...item,
                    feedUrl: row.key
                });
            }
        }
    }
    return articles;
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return String(hash);
}

// ============================================================
// SIMILARITY FUNCTIONS
// ============================================================

function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function jaccardSimilarity(t1, t2) {
    const stopWords = new Set(['to', 'the', 'a', 'an', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'is', 'new', 'us', 'may', 'will', 'says']);
    const s1 = new Set(t1.toLowerCase().split(/\W+/).filter(w => !stopWords.has(w) && w.length > 2));
    const s2 = new Set(t2.toLowerCase().split(/\W+/).filter(w => !stopWords.has(w) && w.length > 2));
    if (s1.size === 0 || s2.size === 0) return 0;
    const intersection = new Set([...s1].filter(x => s2.has(x)));
    const union = new Set([...s1, ...s2]);
    return intersection.size / union.size;
}

// ============================================================
// CLUSTERING ALGORITHMS
// ============================================================

/**
 * Option A: Ollama embeddings + cosine similarity
 */
async function clusterWithOllama(articles, threshold = 0.65) {
    console.log(`\n=== OPTION A: Ollama nomic-embed-text (threshold=${threshold}) ===`);

    const { AI } = await import('../src/engine/gemini.js');

    // Get all headlines
    const headlines = articles.map(a => a.title);
    console.log(`Computing embeddings for ${headlines.length} headlines...`);

    // Fetch embeddings from Ollama
    const embeddingVectors = await AI.embedBatchedHeadlines(headlines);

    // Build embedding map
    const embeddings = {};
    for (let i = 0; i < articles.length; i++) {
        const hash = hashString(articles[i].title);
        embeddings[hash] = embeddingVectors[i];
    }

    // Perform clustering
    return performClustering(articles, embeddings, (vecA, vecB) => cosineSimilarity(vecA, vecB), threshold);
}

/**
 * Option B: Transformers.js embeddings + cosine similarity
 */
async function clusterWithTransformersJS(articles, threshold = 0.5) {
    console.log(`\n=== OPTION B: Transformers.js nomic-embed-text-v1.5 (threshold=${threshold}) ===`);

    try {
        const { pipeline } = await import('@huggingface/transformers');

        console.log('Loading model...');
        const extractor = await pipeline('feature-extraction', 'Xenova/nomic-embed-text-v1.5');

        const embeddings = {};
        console.log(`Computing embeddings for ${articles.length} headlines...`);

        for (let i = 0; i < articles.length; i++) {
            const emb = await extractor(articles[i].title, { pooling: 'mean', normalize: true });
            const hash = hashString(articles[i].title);
            embeddings[hash] = Array.from(emb);
            if ((i + 1) % 20 === 0) {
                console.log(`  Progress: ${i + 1}/${articles.length}`);
            }
        }

        return performClustering(articles, embeddings, cosineSimilarity, threshold);
    } catch (e) {
        console.error('Transformers.js error:', e.message);
        return null;
    }
}

/**
 * Option C: Title-based Jaccard similarity (no embeddings)
 */
function clusterWithJaccard(articles, threshold = 0.3) {
    console.log(`\n=== OPTION C: Jaccard on titles (threshold=${threshold}) ===`);

    // Build a simple embedding map using word sets
    const wordSets = {};
    for (const article of articles) {
        const hash = hashString(article.title);
        const stopWords = new Set(['to', 'the', 'a', 'an', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'is', 'new', 'us', 'may', 'will', 'says']);
        wordSets[hash] = new Set(article.title.toLowerCase().split(/\W+/).filter(w => !stopWords.has(w) && w.length > 2));
    }

    return performClustering(articles, wordSets, (setA, setB) => {
        if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
        const intersection = new Set([...setA].filter(x => setB.has(x)));
        const union = new Set([...setA, ...setB]);
        return intersection.size / union.size;
    }, threshold);
}

/**
 * Option D: Hybrid - URL dedup first, then Jaccard
 */
function clusterWithHybrid(articles, jaccardThreshold = 0.25) {
    console.log(`\n=== OPTION D: URL dedup + Jaccard (threshold=${jaccardThreshold}) ===`);

    // First, deduplicate by link
    const seenLinks = new Map();
    const deduped = [];

    for (const article of articles) {
        const linkDomain = new URL(article.link).hostname;
        const key = `${linkDomain}:${article.title.substring(0, 30)}`;
        if (!seenLinks.has(key)) {
            seenLinks.set(key, true);
            deduped.push(article);
        }
    }
    console.log(`After URL dedup: ${deduped.length} articles (from ${articles.length})`);

    return clusterWithJaccard(deduped, jaccardThreshold);
}

// ============================================================
// CORE CLUSTERING LOOP
// ============================================================

function performClustering(articles, embeddingMap, similarityFn, threshold) {
    const clusters = [];
    const usedIndices = new Set();

    for (let i = 0; i < articles.length; i++) {
        if (usedIndices.has(i)) continue;

        const clusterArr = [articles[i]];
        const hashA = hashString(articles[i].title);
        const vecA = embeddingMap[hashA];
        usedIndices.add(i);

        for (let j = i + 1; j < articles.length; j++) {
            if (usedIndices.has(j)) continue;

            const hashB = hashString(articles[j].title);
            const vecB = embeddingMap[hashB];

            if (vecA && vecB) {
                const similarity = similarityFn(vecA, vecB);
                if (similarity >= threshold) {
                    clusterArr.push(articles[j]);
                    usedIndices.add(j);
                }
            }
        }

        clusters.push({
            title: articles[i].title,
            sources: [...new Set(clusterArr.map(c => c.source))],
            count: clusterArr.length,
            articles: clusterArr
        });
    }

    return clusters;
}

// ============================================================
// ANALYSIS
// ============================================================

function analyzeClusters(clusters, originalCount, label) {
    const stats = {
        label,
        totalClusters: clusters.length,
        totalArticles: originalCount,
        avgClusterSize: clusters.reduce((s, c) => s + c.count, 0) / clusters.length,
        singletonClusters: clusters.filter(c => c.count === 1).length,
        largeClusters: clusters.filter(c => c.count >= 3).length,
        maxClusterSize: Math.max(...clusters.map(c => c.count), 0)
    };

    console.log(`\n--- ${label} Analysis ---`);
    console.log(`Total clusters: ${stats.totalClusters}`);
    console.log(`Total articles: ${stats.totalArticles}`);
    console.log(`Avg cluster size: ${stats.avgClusterSize.toFixed(2)}`);
    console.log(`Singleton clusters: ${stats.singletonClusters} (${(stats.singletonClusters / stats.totalClusters * 100).toFixed(1)}%)`);
    console.log(`Large clusters (3+): ${stats.largeClusters}`);
    console.log(`Max cluster size: ${stats.maxClusterSize}`);

    // Show some problematic clusters (large ones)
    if (stats.largeClusters > 0) {
        console.log('\n--- Sample Large Clusters (potential bad merges) ---');
        const sorted = [...clusters].sort((a, b) => b.count - a.count);
        sorted.slice(0, 3).forEach((c, i) => {
            console.log(`\n[${c.count} articles] "${c.title.substring(0, 70)}..."`);
            console.log(`  Sources: ${c.sources.slice(0, 5).join(', ')}`);
            console.log(`  Titles:`);
            c.articles.slice(0, 3).forEach((a, j) => {
                console.log(`    ${j + 1}. "${a.title.substring(0, 80)}"`);
            });
        });
    }

    return stats;
}

function compareResults(results) {
    console.log('\n\n' + '='.repeat(70));
    console.log('COMPARISON SUMMARY');
    console.log('='.repeat(70));

    console.log('\n| Approach | Clusters | Avg Size | Singletons | Large (3+) | Max |');
    console.log('|----------|----------|----------|------------|-------------|-----|');

    for (const r of results) {
        console.log(`| ${r.label.padEnd(8)} | ${r.totalClusters.toString().padStart(8)} | ${r.avgClusterSize.toFixed(2).padStart(8)} | ${r.singletonClusters.toString().padStart(10)} | ${r.largeClusters.toString().padStart(11)} | ${r.maxClusterSize.toString().padStart(3)} |`);
    }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    console.log('Loading cached articles from database...');
    const articles = await getAllArticles();
    console.log(`Loaded ${articles.length} articles from cache\n`);

    // Use subset for faster testing if needed
    const testArticles = articles; // Use all for full experiment
    console.log(`Using ${testArticles.length} articles for experiment\n`);

    const results = [];

    // Option C first (fast, no model loading)
    const jaccardClusters = clusterWithJaccard(testArticles, 0.3);
    results.push(analyzeClusters(jaccardClusters, testArticles.length, 'Jaccard 0.3'));

    // Option D - Hybrid
    const hybridClusters = clusterWithHybrid(testArticles, 0.25);
    results.push(analyzeClusters(hybridClusters, testArticles.length, 'Hybrid 0.25'));

    // Option A - Ollama (requires Ollama server)
    console.log('\n\nAttempting Ollama clustering...');
    try {
        const ollamaClusters = await clusterWithOllama(testArticles, 0.65);
        results.push(analyzeClusters(ollamaClusters, testArticles.length, 'Ollama 0.65'));
    } catch (e) {
        console.log('Ollama not available:', e.message);
    }

    // Option B - Transformers.js
    console.log('\n\nAttempting Transformers.js clustering...');
    const tfClusters = await clusterWithTransformersJS(testArticles, 0.5);
    if (tfClusters) {
        results.push(analyzeClusters(tfClusters, testArticles.length, 'TF.js 0.5'));
    }

    // Compare
    if (results.length > 1) {
        compareResults(results);
    }

    console.log('\n\nNote: Lower singleton % means more aggressive merging.');
    console.log('If large clusters contain unrelated stories = bad clustering.');
    console.log('Ideal: High clustering (fewer clusters) but with related articles only.');
}

main().catch(console.error);
