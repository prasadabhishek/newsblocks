/**
 * Semantic Clustering Engine
 *
 * Uses Jaccard similarity on cleaned titles for accurate article clustering.
 * This approach was validated through experiments showing it outperforms
 * embedding-based clustering (Ollama) which produces false merges.
 *
 * Key findings from experiments:
 * - Ollama embeddings merge unrelated stories (FIFA game with Trump news)
 * - Basic Jaccard at threshold 0.25-0.3 produces near-zero bad merges
 * - Jaccard is faster and doesn't require AI infrastructure
 */
import { CONFIG } from './config.js';

export class ClusteringEngine {
    /**
     * Identifies clusters of similar headlines using Jaccard similarity.
     * @param {Array} articles - List of raw article objects.
     * @returns {Array} - List of clustered story objects.
     */
    async cluster(articles) {
        if (articles.length === 0) return [];

        return this.heuristicCluster(articles);
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

    heuristicCluster(articles) {
        const clusters = [];
        const usedIndices = new Set();

        for (let i = 0; i < articles.length; i++) {
            if (usedIndices.has(i)) continue;

            const current = articles[i];
            const cluster = [current];
            usedIndices.add(i);

            for (let j = i + 1; j < articles.length; j++) {
                if (usedIndices.has(j)) continue;

                if (this.isSimilar(current.title, articles[j].title)) {
                    cluster.push(articles[j]);
                    usedIndices.add(j);
                }
            }

            clusters.push({
                representativeTitle: this.selectBestTitle(cluster),
                sources: cluster.map(c => c.source),
                citationCount: cluster.length,
                rawArticles: cluster
            });
        }

        return clusters;
    }

    /**
   * Simulates semantic similarity check.
   * In production, this would use Vector Embeddings + Cosine Similarity.
   */
    isSimilar(t1, t2) {
        // Common stop words + promotional/deal words that cause false clusters
        const stopWords = new Set([
            'to', 'the', 'a', 'an', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'is', 'new', 'us', 'may', 'will', 'says',
            // Promotional/deal words - generic e-commerce terms that don't indicate news similarity
            'sale', 'deals', 'discount', 'save', 'cheap', 'price', 'prices', 'off', 'free', 'best', 'top'
        ]);

        const s1 = new Set(t1.toLowerCase().split(/\W+/).filter(w => !stopWords.has(w) && w.length > 2));
        const s2 = new Set(t2.toLowerCase().split(/\W+/).filter(w => !stopWords.has(w) && w.length > 2));

        if (s1.size === 0 || s2.size === 0) return false;

        // Intersection over Union (Jaccard Similarity)
        const intersection = new Set([...s1].filter(x => s2.has(x)));
        const union = new Set([...s1, ...s2]);

        const score = intersection.size / union.size;

        // Threshold adjusted for common word overlaps (e.g. Starship/SpaceX)
        return score >= CONFIG.JACCARD_THRESHOLD;
    }

    selectBestTitle(cluster) {
        // Preference for titles with the most "entities" (capitalized words)
        // while avoiding generic marketing/report words.
        const score = (title) => {
            const forbidden = /outlook|performance|trends|developments|issues|news|update|summary|report/i;
            if (forbidden.test(title)) return -100;

            const words = title.split(/\s+/);
            const entities = words.filter(w => /^[A-Z]/.test(w) && w.length > 2).length;
            return entities + (title.length / 50); // Tie-breaker for length
        };

        return cluster.reduce((a, b) => score(a.title) >= score(b.title) ? a : b).title;
    }
}
