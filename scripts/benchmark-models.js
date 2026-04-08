/**
 * Benchmark: Compare gemma3:4b vs gemma4:e4b
 * Tests speed, quality (clustering/categorization), and resource usage
 *
 * Run with: node scripts/benchmark-models.js
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDb } from '../src/engine/sqlite-cache.js';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

// ============================================================
// DATA LOADING
// ============================================================

async function getCachedArticles(limit = 50) {
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
    // Return a sample of recent, diverse articles
    return articles.slice(0, limit);
}

// ============================================================
// OLLAMA CALLS
// ============================================================

async function ollamaGenerate(model, prompt) {
    const startTime = Date.now();
    const response = await axios.post(`${OLLAMA_HOST}/api/generate`, {
        model,
        prompt,
        stream: false,
        options: { temperature: 0.1 }
    });
    const latency = Date.now() - startTime;
    return { response: response.data.response, latency };
}

async function ollamaEmbed(model, texts) {
    const startTime = Date.now();
    const response = await axios.post(`${OLLAMA_HOST}/api/embeddings`, {
        model,
        prompt: texts[0]
    });
    const latency = Date.now() - startTime;
    return { embedding: response.data.embedding, latency };
}

// ============================================================
// SYSTEM METRICS
// ============================================================

async function getOllamaProcessStats() {
    try {
        // Get ollama process CPU/memory if available
        const { stdout } = await execAsync('ps aux | grep ollama | grep -v grep || echo "no ollama process"');
        return stdout.trim() || 'no ollama process';
    } catch {
        return 'could not fetch';
    }
}

async function getSystemMemory() {
    try {
        if (process.platform === 'darwin') {
            const { stdout } = await execAsync('vm_stat | head -5');
            return stdout.trim();
        } else {
            const { stdout } = await execAsync('free -m');
            return stdout.trim();
        }
    } catch {
        return 'could not fetch';
    }
}

// ============================================================
// PROMPTS
// ============================================================

const CATEGORY_PROMPT = `Given this news headline, respond with ONLY ONE category from this list: US, World, Business, Technology, Science, Stocks. No explanation.

Headline: "{title}"
Category:`;

const SENTIMENT_PROMPT = `Analyze this news headline. Respond with ONLY a JSON object: {"sentiment": "negative|neutral|positive", "relevance": 1-10, "hard_news": true|false}. No explanation.

Headline: "{title}"
Analysis:`;

const JUNK_PROMPT = `Is this headline about sports, entertainment, gossip, or lifestyle? Respond with ONLY "JUNK" or "NOT_JUNK". No explanation.

Headline: "{title}"
Result:`;

// ============================================================
// QUALITY METRICS
// ============================================================

function calculateCategoryConsistency(results) {
    // Check if similar headlines get same category
    let consistent = 0;
    let total = 0;
    for (let i = 0; i < results.length; i++) {
        for (let j = i + 1; j < results.length; j++) {
            if (results[i].title.includes(results[j].title.split(' ').slice(0, 3).join(' ')) ||
                results[j].title.includes(results[i].title.split(' ').slice(0, 3).join(' '))) {
                if (results[i].category === results[j].category) consistent++;
                total++;
            }
        }
    }
    return total > 0 ? (consistent / total) * 100 : 0;
}

function calculateJunkDetectionAccuracy(results, groundTruth) {
    const detected = results.filter(r => r.isJunk).length;
    const expected = groundTruth.filter(r => r.isJunk).length;
    return { detected, expected, accuracy: expected > 0 ? (detected / expected) * 100 : 100 };
}

// ============================================================
// BENCHMARK RUNNER
// ============================================================

async function benchmarkModel(model, articles, modelLabel) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`BENCHMARKING: ${modelLabel} (${model})`);
    console.log('='.repeat(60));

    const results = [];
    const latencies = [];
    let totalTime = 0;
    const startTotal = Date.now();

    // Memory before
    const memBefore = await getSystemMemory();

    console.log(`\nRunning ${articles.length} article analysis...`);

    for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        const title = article.title || article.link;

        if (i % 10 === 0) {
            console.log(`  Progress: ${i + 1}/${articles.length}`);
        }

        try {
            // Run 3 inference calls (category, sentiment, junk) sequentially
            const [catResult, sentResult, junkResult] = await Promise.all([
                ollamaGenerate(model, CATEGORY_PROMPT.replace('{title}', title)),
                ollamaGenerate(model, SENTIMENT_PROMPT.replace('{title}', title)),
                ollamaGenerate(model, JUNK_PROMPT.replace('{title}', title))
            ]);

            latencies.push(catResult.latency + sentResult.latency + junkResult.latency);

            results.push({
                title,
                category: catResult.response.trim(),
                sentiment: sentResult.response.trim(),
                isJunk: junkResult.response.includes('JUNK')
            });
        } catch (e) {
            console.log(`  Error on "${title.substring(0, 50)}...": ${e.message}`);
        }
    }

    totalTime = Date.now() - startTotal;

    // Memory after
    const memAfter = await getSystemMemory();

    // Statistics
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const medianLatency = latencies.sort()[Math.floor(latencies.length / 2)];
    const maxLatency = Math.max(...latencies);
    const minLatency = Math.min(...latencies);

    console.log(`\n--- SPEED METRICS ---`);
    console.log(`Total time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`Articles processed: ${results.length}`);
    console.log(`Throughput: ${(results.length / (totalTime / 1000)).toFixed(2)} articles/sec`);
    console.log(`Avg latency per article (3 calls): ${avgLatency.toFixed(0)}ms`);
    console.log(`Median latency: ${medianLatency}ms`);
    console.log(`Min/Max latency: ${minLatency}ms / ${maxLatency}ms`);

    console.log(`\n--- QUALITY METRICS ---`);
    console.log(`Categories assigned:`);
    const catCounts = {};
    results.forEach(r => {
        const cat = r.category.replace(/['"\n]/g, '').trim();
        catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
    Object.entries(catCounts).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
    });

    const junkCount = results.filter(r => r.isJunk).length;
    console.log(`\nJunk detected: ${junkCount} (${(junkCount / results.length * 100).toFixed(1)}%)`);

    console.log(`\n--- SYSTEM STATE ---`);
    console.log(`Memory before: ${memBefore.split('\n')[0]}`);
    console.log(`Memory after: ${memAfter.split('\n')[0]}`);

    return {
        model,
        label: modelLabel,
        totalTime,
        throughput: results.length / (totalTime / 1000),
        avgLatency,
        medianLatency,
        minLatency,
        maxLatency,
        results,
        catCounts,
        junkCount
    };
}

async function compareModels(benchmark1, benchmark2) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('COMPARISON SUMMARY');
    console.log('='.repeat(60));

    console.log(`\n| Metric | ${benchmark1.label} | ${benchmark2.label} | Winner |`);
    console.log(`|--------|---------------|---------------|--------|`);
    console.log(`| Total Time | ${(benchmark1.totalTime/1000).toFixed(2)}s | ${(benchmark2.totalTime/1000).toFixed(2)}s | ${benchmark1.totalTime < benchmark2.totalTime ? benchmark1.label : benchmark2.label} |`);
    console.log(`| Throughput | ${benchmark1.throughput.toFixed(2)}/s | ${benchmark2.throughput.toFixed(2)}/s | ${benchmark1.throughput > benchmark2.throughput ? benchmark1.label : benchmark2.label} |`);
    console.log(`| Avg Latency | ${benchmark1.avgLatency.toFixed(0)}ms | ${benchmark2.avgLatency.toFixed(0)}ms | ${benchmark1.avgLatency < benchmark2.avgLatency ? benchmark1.label : benchmark2.label} |`);

    // Quality comparison
    console.log(`\n--- Category Distribution ---`);
    const allCats = new Set([...Object.keys(benchmark1.catCounts), ...Object.keys(benchmark2.catCounts)]);
    for (const cat of allCats) {
        const c1 = benchmark1.catCounts[cat] || 0;
        const c2 = benchmark2.catCounts[cat] || 0;
        console.log(`  ${cat}: ${benchmark1.label}=${c1}, ${benchmark2.label}=${c2}`);
    }

    console.log(`\n--- Junk Detection ---`);
    console.log(`  ${benchmark1.label}: ${benchmark1.junkCount}`);
    console.log(`  ${benchmark2.label}: ${benchmark2.junkCount}`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    console.log('Loading cached articles...');
    const articles = await getCachedArticles(30); // Test with 30 articles
    console.log(`Loaded ${articles.length} articles\n`);

    if (articles.length === 0) {
        console.log('No articles in cache. Run gather-news.js first.');
        return;
    }

    // Test gemma3:4b
    const gemma3Results = await benchmarkModel('gemma3:4b', articles, 'gemma3:4b');

    // Small delay between tests
    await new Promise(r => setTimeout(r, 2000));

    // Test gemma4:e4b
    const gemma4Results = await benchmarkModel('gemma4:e4b', articles, 'gemma4:e4b');

    // Compare
    await compareModels(gemma3Results, gemma4Results);

    console.log(`\n${'='.repeat(60)}`);
    console.log('BENCHMARK COMPLETE');
    console.log('='.repeat(60));
}

main().catch(console.error);
