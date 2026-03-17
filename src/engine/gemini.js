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

        try {
            const model = genAI.getGenerativeModel({ model: MODELS.EMBEDDING });

            const requests = headlines.map(h => ({
                content: { parts: [{ text: h }] }
            }));

            // Pacing for free tier
            await sleep(500);

            console.log(`AI: Fetching embeddings for ${headlines.length} headlines in one batch...`);
            const result = await retry(() => model.batchEmbedContents({ requests }), 2, 20000);

            if (result && result.embeddings) {
                return result.embeddings.map(e => e.values);
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
        // Note: checking specifically for the new string-based sentiment 
        // to naturally bust the old float-based cache
        if (cached && typeof cached.sentiment === 'string') return cached.sentiment;

        const prompt = `
      Analyze the sentiment of this headline and classify it exactly into one of these buckets:
      ["DISASTER", "NEGATIVE", "NEUTRAL", "POSITIVE", "EUPHORIC"]
      
      CRITICAL HIERARCHY:
      1. WAR, CONFLICT, DISRUPTION, or CRISIS = ALWAYS "NEGATIVE" or "DISASTER". Even if "aid" or "talks" are mentioned, the underlying state is negative.
      2. GROWTH, BREAKTHROUGH, RECOVERY, or SUCCESS = "POSITIVE" or "EUPHORIC".
      3. ADMINISTRATIVE, SCHEDULING, or PURE STATEMENTS = "NEUTRAL".

      Step 1: Identify key events. If it involves a security threat or a war zone (e.g. Hormuz, Gaza, Ukraine), it is NEGATIVE.
      Step 2: Output ONLY a JSON object: { "sentiment": "NEGATIVE", "reasoning": "brief string" }

      Headline: "${headline}"
    `;

        try {
            const text = await this.runWithFallback(prompt, 10000);
            const json = robustParse(text);

            if (!json || !json.sentiment) return null;

            const sentiment = json.sentiment.toUpperCase();
            if (["DISASTER", "NEGATIVE", "NEUTRAL", "POSITIVE", "EUPHORIC"].includes(sentiment)) {
                Cache.setInference(hash, { sentiment: sentiment, reasoning: json.reasoning });
                return sentiment;
            }
            return null;
        } catch (e) {
            console.error("Sentiment AI failed completely:", e.message);
            return null;
        }
    }
};
