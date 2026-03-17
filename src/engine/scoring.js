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

        let sentimentStr = await AI.analyzeSentiment(cluster.representativeTitle);

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
            importance: this.calculateImportance(cluster)
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
        // Formula: Log-weighted citation count + bonus for variety of sources
        const base = Math.log2(cluster.citationCount + 1) * 30; // 1 cite = 30, 3 cites = 60, etc
        const sourceVariety = new Set(cluster.sources).size * 5;

        return Math.min(100, Math.floor(base + sourceVariety));
    }

    /**
     * Editorial filter to drop promotional or generic content.
     */
    isHardNews(title) {
        const t = title.toLowerCase();

        // Promotional/Advice "Red Flags"
        const redFlags = [
            'picks', 'best stocks', 'to buy', 'how to', 'top funds', 'top 2', 'top 5',
            'should you', 'recommends', 'outlook', 'prediction', 'market roundup',
            'morning brief', 'daily brief', 'newsletter', 'explained'
        ];

        if (redFlags.some(flag => t.includes(flag))) {
            return false;
        }

        // Must look like an event (has a verb or clear entity action)
        // This is a soft check, often articles with punctuation like ":" or " - " are reports too
        if (t.split(' ').length < 3) return false;

        return true;
    }
}
