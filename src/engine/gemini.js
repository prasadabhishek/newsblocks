import { GoogleGenerativeAI } from "@google/generative-ai";
import { retry, hashString, robustParse, sleep } from "./utils.js";
import { Cache } from "./cache.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "MOCK_KEY");

const MODELS = {
    PRIMARY: "gemini-2.5-flash",
    FALLBACK: "gemini-2.5-flash-lite",
    EMBEDDING: "gemini-embedding-001"
};

/**
 * AI Utility for News Map.
 * Provides semantic clustering and sentiment analysis using Gemini.
 */
export const AI = {
    /**
     * Internal helper to run a prompt with fallback models.
     */
    async runWithFallback(prompt, retryDelay = 30000) {
        // Pacing: Artificial delay to stay well within burst limits
        await sleep(500);

        // Tier 1: Primary Model (Flash)
        try {
            console.log(`AI: Trying primary model (${MODELS.PRIMARY})...`);
            const model = genAI.getGenerativeModel({ model: MODELS.PRIMARY });
            const result = await retry(() => model.generateContent(prompt), 2, retryDelay);
            return (await result.response).text();
        } catch (e) {
            console.error(`AI: Primary model failed: ${e.message}. Switching to fallback...`);

            // Tier 2: Fallback Model (Flash)
            try {
                console.log(`AI: Trying fallback model (${MODELS.FALLBACK})...`);
                const model = genAI.getGenerativeModel({ model: MODELS.FALLBACK });
                const result = await retry(() => model.generateContent(prompt), 1, retryDelay);
                return (await result.response).text();
            } catch (e2) {
                console.error(`AI: Fallback model also failed: ${e2.message}`);
                throw e2;
            }
        }
    },

    /**
     * Embeds headlines using text-embedding-004 in batches.
     * @param {Array<string>} headlines
     * @returns {Promise<Array<Array<number>>>}
     */
    async embedBatchedHeadlines(headlines) {
        if (!process.env.GEMINI_API_KEY) {
            console.warn("GEMINI_API_KEY not found. Using fallback clustering.");
            return null;
        }

        const hashes = headlines.map(h => hashString(h));
        const results = new Array(headlines.length).fill(null);
        const missingIndices = [];

        // 1. Check Cache
        hashes.forEach((hash, i) => {
            const cached = Cache.getEmbedding(hash);
            if (cached) results[i] = cached;
            else missingIndices.push(i);
        });

        if (missingIndices.length === 0) return results;

        try {
            const model = genAI.getGenerativeModel({ model: MODELS.EMBEDDING });
            const missingHeadlines = missingIndices.map(i => headlines[i]);

            const requests = missingHeadlines.map(h => ({
                content: { parts: [{ text: h }] }
            }));

            // Pacing for free tier
            await sleep(500);

            console.log(`AI: Fetching embeddings for ${missingHeadlines.length} NEW headlines...`);
            const result = await retry(() => model.batchEmbedContents({ requests }), 2, 20000);

            if (result && result.embeddings) {
                result.embeddings.forEach((e, i) => {
                    const originalIndex = missingIndices[i];
                    const val = e.values;
                    results[originalIndex] = val;
                    Cache.setEmbedding(hashes[originalIndex], val);
                });
                return results;
            }
            return null;
        } catch (e) {
            console.error("Gemini embedding failed:", e.message);
            return null;
        }
    },

    /**
     * Analyzes sentiment using an LLM.
     */
    async analyzeSentiment(headline) {
        if (!process.env.GEMINI_API_KEY) return null;

        const hash = hashString(headline);
        const cached = Cache.getInference(hash);
        // Requirement: Must have both sentiment and the new relevance score
        if (cached && cached.sentiment && typeof cached.relevance === 'number') {
            return { sentiment: cached.sentiment, relevance: cached.relevance };
        }

        const prompt = `
      Analyze this news headline for a high-signal news dashboard.
      
      Headline: "${headline}"

      Return a JSON object with:
      1. "sentiment": Classify exactly into ["DISASTER", "NEGATIVE", "NEUTRAL", "POSITIVE", "EUPHORIC"].
         - WAR, CONFLICT, CRISIS = DISASTER or NEGATIVE.
         - SUCCESS, BREAKTHROUGH, RECOVERY = POSITIVE or EUPHORIC.
      2. "relevance": A score from 1 to 10 based on GLOBAL or REGIONAL significance.
         - 10: World-changing event (War, Global Election, Pandemic).
         - 5-7: Major corporate news, significant policy changes, regional crises.
         - 1-3: Niche news, stock tickers, routine announcements.
      3. "reasoning": Brief 1-sentence explanation.

      Output ONLY JSON.
    `;

        try {
            const text = await this.runWithFallback(prompt, 10000);
            const json = robustParse(text);

            if (!json || !json.sentiment) return null;

            const sentiment = json.sentiment.toUpperCase();
            const relevance = Number(json.relevance) || 5;

            if (["DISASTER", "NEGATIVE", "NEUTRAL", "POSITIVE", "EUPHORIC"].includes(sentiment)) {
                const result = { sentiment, relevance, reasoning: json.reasoning };
                Cache.setInference(hash, result);
                return result;
            }
            return null;
        } catch (e) {
            console.error("Sentiment AI failed completely:", e.message);
            return null;
        }
    }
};
