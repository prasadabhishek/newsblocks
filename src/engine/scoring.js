/**
 * Scoring Engine
 * Calculates sentiment and importance for a story cluster.
 */
import { AI } from './gemini.js';

export class ScoringEngine {
    /**
     * Calculates scores for a cluster.
     * @param {Object} cluster - The story cluster from ClusteringEngine.
     * @returns {Object} - Scored story object.
     */
    async calculateScores(cluster) {
        // Filter out non-hard news early
        if (!this.isHardNews(cluster.representativeTitle)) {
            return null;
        }

        const aiResult = await AI.analyzeSentiment(cluster.representativeTitle);
        let sentimentStr = aiResult ? aiResult.sentiment : null;
        const relevance = aiResult ? aiResult.relevance : 5;

        if (!sentimentStr || !['DISASTER', 'NEGATIVE', 'NEUTRAL', 'POSITIVE', 'EUPHORIC'].includes(sentimentStr.toUpperCase())) {
            let heuristicScore = this.analyzeSentiment(cluster.representativeTitle);
            if (heuristicScore <= -0.6) sentimentStr = 'DISASTER';
            else if (heuristicScore < -0.1) sentimentStr = 'NEGATIVE';
            else if (heuristicScore > 0.6) sentimentStr = 'EUPHORIC';
            else if (heuristicScore > 0.1) sentimentStr = 'POSITIVE';
            else sentimentStr = 'NEUTRAL';
        }

        const bucketMap = { 'DISASTER': -0.9, 'NEGATIVE': -0.4, 'NEUTRAL': 0.0, 'POSITIVE': 0.4, 'EUPHORIC': 0.9 };

        return {
            ...cluster,
            sentiment: bucketMap[sentimentStr.toUpperCase()] || 0,
            relevance_score: relevance,
            importance: this.calculateImportance({ ...cluster, relevance_score: relevance })
        };
    }

    analyzeSentiment(text) {
        const positiveWords = [
            'surge', 'gain', 'breakthrough', 'success', 'discovery', 'growth', 'rise', 'win',
            'recovery', 'boost', 'advance', 'innovation', 'historic', 'milestone', 'soar',
            'jump', 'strong', 'positive', 'rally', 'upgrade', 'optimism', 'beat', 'outperform',
            'record', 'unveil', 'profit', 'expansion', 'deal', 'agreement', 'peace', 'aid'
        ];
        const negativeWords = [
            'fall', 'crisis', 'crash', 'loss', 'threat', 'leak', 'drop', 'war', 'unrest',
            'plot', 'detain', 'arrest', 'antisemitic', 'attack', 'deadly', 'killing',
            'sanctions', 'probe', 'investigation', 'scandal', 'protest', 'strike', 'clash',
            'slump', 'lower', 'miss', 'disappoint', 'cut', 'weak', 'risk', 'warning',
            'conflict', 'hostage', 'escalation', 'tensions', 'nuclear', 'missile', 'death'
        ];

        const words = text.toLowerCase().split(/\W+/);
        let score = 0;

        words.forEach(w => {
            if (positiveWords.includes(w)) score += 0.4;
            if (negativeWords.includes(w)) score -= 0.4;
        });

        // Clamp between -1 and 1
        return Math.max(-1, Math.min(1, score));
    }

    calculateImportance(cluster) {
        // 1. Base Relevance from AI (Scaled 0-50)
        const relevanceBase = (cluster.relevance_score || 5) * 5;

        // 2. Source Power (Elite sources provide high signal)
        const tier1Count = (cluster.rawArticles || []).filter(a => a.tier === 1).length;
        const tierBonus = tier1Count * 10;

        // 3. Citation Velocity (Variety of sources)
        const sourceVariety = new Set(cluster.sources).size * 5;

        const total = Math.floor(relevanceBase + tierBonus + sourceVariety);

        // Clamp between 10 and 100
        return Math.max(10, Math.min(100, total));
    }

    /**
     * Editorial filter to drop promotional, niche listicles, or generic service content.
     */
    isHardNews(title) {
        const t = title.toLowerCase();

        // High-confidence Ref Flags for V4
        const redFlags = [
            'ticker:', 'price alert', 'stock update', 'how to buy', 'where to watch', 'live stream',
            'picks', 'best stocks', 'to buy', 'how to', 'top funds', 'top 2', 'top 5', 'top 10',
            'should you', 'recommends', 'outlook', 'prediction', 'market roundup',
            'morning brief', 'daily brief', 'newsletter', 'explained', 'checklist',
            'reasons why', 'gift ideas', 'buying guide', 'where to watch', 'live stream',
            'podcast', 'analysis:', 'opinion:', 'video:', 'watch now', 'inside story'
        ];

        if (redFlags.some(flag => t.includes(flag))) {
            return false;
        }

        // Question marks often imply discussion/features rather than events
        if (t.includes('?')) return false;

        // Must look like an event (has a verb or clear entity action)
        if (t.split(' ').length < 4) return false;

        return true;
    }
}
