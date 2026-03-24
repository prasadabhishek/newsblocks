import { ClusteringEngine } from './clustering.js';
import { ScoringEngine } from './scoring.js';

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
            console.log(`Clustering raw feed for: ${name}...`);
            const clusters = await this.clustering.cluster(rawArticles);

            for (const c of clusters) {
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
                            // If AI invents a weird category, fallback to World
                            finalCat = "World";
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
        }

        // Cleanup empty categories
        root.children = root.children.filter(c => c.children.length > 0);

        return root;
    }
}
