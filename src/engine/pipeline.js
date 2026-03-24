import { ClusteringEngine } from './clustering.js';
import { ScoringEngine } from './scoring.js';
import { AI } from './gemini.js';
import { CONFIG } from './config.js';

// Simple color helpers (no external deps)
const colors = {
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
    white: (s) => `\x1b[37m${s}\x1b[0m`,
    gray: (s) => `\x1b[90m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

export class Pipeline {
    constructor() {
        this.clustering = new ClusteringEngine();
        this.scoring = new ScoringEngine();
    }

    /**
     * Find a semantically similar story using embedding similarity.
     * @param {string} title - Representative title to match
     * @param {Map} seenStories - Map of seen story hashes to {catIndex, childIndex, embedding}
     * @returns {{catIndex: number, childIndex: number, similarity: number} | null}
     */
    async findSimilarStory(title, seenStories) {
        const embeddings = await AI.embedBatchedHeadlines([title]);
        const newEmbedding = embeddings[0];
        if (!newEmbedding) return null;

        let bestMatch = null;
        let bestSimilarity = CONFIG.SIMILARITY_THRESHOLD;

        for (const [, info] of seenStories) {
            if (!info.embedding) continue;
            const similarity = this.cosineSimilarity(newEmbedding, info.embedding);
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = { catIndex: info.catIndex, childIndex: info.childIndex, similarity };
            }
        }

        return bestMatch;
    }

    cosineSimilarity(vecA, vecB) {
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

    async run(categoriesArray) {
        const root = {
            name: "Top News",
            lastUpdated: new Date().toISOString(),
            children: [
                { name: "World", children: [] },
                { name: "US", children: [] },
                { name: "Seattle", children: [] },
                { name: "Politics", children: [] },
                { name: "Finance", children: [] },
                { name: "Business", children: [] },
                { name: "Technology", children: [] },
                { name: "Science", children: [] }
            ]
        };

        const catNameToIndex = {};
        root.children.forEach((c, i) => catNameToIndex[c.name] = i);

        const seenStoryHashes = new Map(); // hash -> { catIndex, childIndex }

        for (const cat of categoriesArray) {
            const { name, rawArticles } = cat;
            const catStart = Date.now();
            console.log(`\n${colors.bold('┌─')} Category: ${colors.bold(name)} (${rawArticles.length} articles)`);
            console.log(colors.gray('├' + '─'.repeat(68)));
            const clusters = await this.clustering.cluster(rawArticles);

            let kept = 0, dropped = 0, junk = 0;

            for (const c of clusters) {
                const scored = await this.scoring.calculateScores(c);
                if (scored) {
                    // --- V4.6 TABLOID FILTER ---
                    if (scored.aiCategory === "JUNK") {
                        console.log(`${colors.gray('│  ')}${colors.yellow('[JUNK]')}  ${colors.gray(scored.representativeTitle.substring(0, 55))}`);
                        junk++;
                        continue;
                    }

                    // --- V4 SMART CONSENSUS GATE ---
                    const hasConsensus = scored.citationCount > 1;
                    const isTier1 = scored.rawArticles.some(a => a.tier === 1);
                    const isHighRelevance = (scored.relevance_score || 0) >= 5;
                    // Preserve DISASTER/NEGATIVE events - they're inherently newsworthy even from Tier 2
                    const isSignificantEvent = scored.sentiment <= -0.4; // DISASTER (-0.9) or NEGATIVE (-0.4)

                    // 1. Always keep Tier 1 stories (Elite publishers are high-signal by default)
                    // 2. Keep Tier 2 stories if: has consensus OR high relevance (>=5) OR significant negative event
                    if (!isTier1 && !hasConsensus && !isHighRelevance && !isSignificantEvent) {
                        console.log(`${colors.gray('│  ')}${colors.red('[DROP]')}  ${colors.gray(scored.representativeTitle.substring(0, 45))} ${colors.dim('(low signal)')}`);
                        dropped++;
                        continue;
                    }
                    // --------------------------

                    const titleHash = scored.representativeTitle.toLowerCase().trim();

                    // Check exact title match first (fast path)
                    if (seenStoryHashes.has(titleHash)) {
                        const pos = seenStoryHashes.get(titleHash);
                        const existing = root.children[pos.catIndex].children[pos.childIndex];

                        existing.sources = [...new Set([...existing.sources, ...scored.sources])];
                        existing.citationCount += scored.citationCount;
                        existing.rawArticles = [...existing.rawArticles, ...scored.rawArticles];

                        existing.importance = this.scoring.calculateImportance(existing);
                        console.log(`${colors.gray('│  ')}${colors.cyan('[MERGE]')} ${colors.white(scored.representativeTitle.substring(0, 50))} ${colors.dim('(+' + scored.citationCount + ' sources)')}`);
                    } else {
                        // Try semantic similarity search (catches title rewrites)
                        const similar = await this.findSimilarStory(scored.representativeTitle, seenStoryHashes);

                        if (similar) {
                            const existing = root.children[similar.catIndex].children[similar.childIndex];

                            existing.sources = [...new Set([...existing.sources, ...scored.sources])];
                            existing.citationCount += scored.citationCount;
                            existing.rawArticles = [...existing.rawArticles, ...scored.rawArticles];

                            existing.importance = this.scoring.calculateImportance(existing);
                            console.log(`${colors.gray('│  ')}${colors.cyan('[SEMANTIC MERGE]')} ${colors.white(scored.representativeTitle.substring(0, 45))} ${colors.dim('(sim=' + similar.similarity.toFixed(2) + ', +' + scored.citationCount + ' src)')}`);
                        } else {
                            // No match - add as new story
                            scored.slug = scored.representativeTitle
                                .toLowerCase()
                                .replace(/[^a-z0-9\s-]/g, '')
                                .trim()
                                .replace(/\s+/g, '-');

                            let finalCat = scored.aiCategory;
                            if (name === "US" || name === "Seattle") {
                                finalCat = name;
                            }
                            if (!catNameToIndex.hasOwnProperty(finalCat)) {
                                finalCat = "World";
                            }

                            const targetCatIndex = catNameToIndex[finalCat];
                            const destArray = root.children[targetCatIndex].children;

                            // Get embedding for this title for future semantic dedup
                            const embeddings = await AI.embedBatchedHeadlines([scored.representativeTitle]);
                            const embedding = embeddings[0] || null;

                            seenStoryHashes.set(titleHash, {
                                catIndex: targetCatIndex,
                                childIndex: destArray.length,
                                embedding
                            });
                            destArray.push(scored);
                            kept++;
                            const sentimentEmoji = scored.sentiment <= -0.6 ? '🔴' : scored.sentiment <= -0.3 ? '🟠' : scored.sentiment <= 0.3 ? '⚪' : scored.sentiment <= 0.6 ? '🟢' : '💚';
                            console.log(`${colors.gray('│  ')}${colors.green('[NEW]')}  ${sentimentEmoji} ${colors.white(scored.representativeTitle.substring(0, 50))}`);
                        }
                    }
                }
            }
            const catTime = ((Date.now() - catStart) / 1000).toFixed(1);
            console.log(colors.gray(`└─ ${name}: ${kept} kept, ${dropped} dropped, ${junk} junk (${catTime}s)`));
        }

        // Cleanup empty categories
        root.children = root.children.filter(c => c.children.length > 0);

        return root;
    }
}
