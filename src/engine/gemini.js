import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { retry, hashString, robustParse, sleep } from "./utils.js";
import { Cache } from "./cache.js";

let _genAI = null;
const getGenAI = () => {
    if (!_genAI) {
        _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "MOCK_KEY");
    }
    return _genAI;
};

const MODELS = {
    GEMINI_PRIMARY: "gemini-1.5-flash",
    GEMINI_FALLBACK: "gemini-1.5-flash-8b",
    MINIMAX_PRIMARY: "MiniMax-Text-01",
    EMBEDDING: "text-embedding-004"
};

const getProvider = () => process.env.AI_PROVIDER || "gemini";

/**
 * AI Utility for News Map.
 * Supports Gemini and MiniMax providers.
 */
export const AI = {
    /**
     * Internal helper to run a prompt with provider-specific logic.
     */
    async runWithFallback(prompt, retryDelay = 30000) {
        await sleep(500); // Pacing for rate limits

        if (getProvider() === "minimax") {
            return this.runMiniMax(prompt, retryDelay);
        }

        // Default: Gemini
        return this.runGemini(prompt, retryDelay);
    },

    /**
     * Gemini Implementation
     */
    async runGemini(prompt, retryDelay) {
        try {
            console.log(`AI: Trying Gemini primary (${MODELS.GEMINI_PRIMARY})...`);
            // Note: If using v1beta, some models require different naming or a specific SDK config.
            // We'll try the stable name first.
            const model = getGenAI().getGenerativeModel({ model: MODELS.GEMINI_PRIMARY });
            const result = await retry(() => model.generateContent(prompt), 2, 30000); // Production retry
            return (await result.response).text();
        } catch (e) {
            console.error(`AI: Gemini primary failed: ${e.message}. Trying fallback...`);
            const model = getGenAI().getGenerativeModel({ model: MODELS.GEMINI_FALLBACK });
            const result = await retry(() => model.generateContent(prompt), 1, 30000);
            return (await result.response).text();
        }
    },

    /**
     * MiniMax Implementation (OpenAI Compatible)
     */
    async runMiniMax(prompt, retryDelay) {
        const apiKey = process.env.MINIMAX_API_KEY;
        if (!apiKey) {
            console.warn("MINIMAX_API_KEY not found. Falling back to Gemini...");
            return this.runGemini(prompt, retryDelay);
        }

        try {
            console.log(`AI: Trying MiniMax (${MODELS.MINIMAX_PRIMARY})...`);
            const response = await retry(() => axios.post(
                "https://api.minimax.io/v1/chat/completions",
                {
                    model: MODELS.MINIMAX_PRIMARY,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1
                },
                {
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    }
                }
            ), 2, 30000);

            return response.data.choices[0].message.content;
        } catch (e) {
            const errorMsg = e.response ? JSON.stringify(e.response.data) : e.message;
            console.error(`AI: MiniMax failed: ${errorMsg}. Falling back to Gemini...`);
            return this.runGemini(prompt, retryDelay);
        }
    },

    /**
     * Embeds headlines (Always uses Gemini/Vertex for now as MiniMax embeddings differ significantly).
     */
    async embedBatchedHeadlines(headlines) {
        if (!process.env.GEMINI_API_KEY) {
            console.warn("GEMINI_API_KEY not found. Using fallback clustering.");
            return null;
        }

        const hashes = headlines.map(h => hashString(h));
        const results = new Array(headlines.length).fill(null);
        const missingIndices = [];

        hashes.forEach((hash, i) => {
            const cached = Cache.getEmbedding(hash);
            if (cached) results[i] = cached;
            else missingIndices.push(i);
        });

        if (missingIndices.length === 0) return results;

        try {
            const model = getGenAI().getGenerativeModel({ model: MODELS.EMBEDDING });
            const missingHeadlines = missingIndices.map(i => headlines[i]);
            const requests = missingHeadlines.map(h => ({
                content: { parts: [{ text: h }] }
            }));

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
     * Analyzes sentiment.
     */
    async analyzeSentiment(headline) {
        if (!process.env.GEMINI_API_KEY && !process.env.MINIMAX_API_KEY) return null;

        const hash = hashString(headline);
        const cached = Cache.getInference(hash);
        if (cached && cached.sentiment && typeof cached.relevance === 'number' && cached.category && cached.title) {
            return cached;
        }

        const prompt = `
      Analyze this news headline for a high-signal news dashboard.
      
      Headline: "${headline}"

      Return a JSON object with:
      1. "sentiment": Classify exactly into ["DISASTER", "NEGATIVE", "NEUTRAL", "POSITIVE", "EUPHORIC"].
         - Evaluate based on broad HUMAN IMPACT and consensus societal sentiment.
         - POSITIVE/EUPHORIC: Scientific breakthroughs, peace agreements, economic stability, and huge humanitarian wins.
         - NEGATIVE/DISASTER: Large-scale loss of life, natural disasters, severe economic crashes, and humanitarian crises.
         - NEUTRAL: Geopolitical posturing, legislative updates, corporate moves, and complex zero-sum political events where there is no clear human 'win' or 'loss'.
      2. "relevance": A score from 1 to 10 based on GLOBAL or REGIONAL significance.
         - 10: History-making events.
         - 5-7: Significant national/regional news.
         - 1-3: Routine updates.
      3. "category": Classify into ["World", "Politics", "Business", "Technology", "Science", "JUNK"]. 
         - CRITICAL: If the headline is about Sports, Celebrities, Entertainment, Pop Culture, or Gossip, you MUST classify it as "JUNK" so we can filter it out.
      4. "title": Synthesize a clean, professional, objective 7-word headline explaining the core news event.
      5. "reasoning": Brief context for your choice.

      Output ONLY JSON.
    `;

        try {
            const text = await this.runWithFallback(prompt, 10000);
            const json = robustParse(text);

            if (!json || !json.sentiment) return null;

            const sentiment = json.sentiment.toUpperCase();
            const relevance = Number(json.relevance) || 5;
            const category = json.category || "World";
            const title = json.title || headline;

            if (["DISASTER", "NEGATIVE", "NEUTRAL", "POSITIVE", "EUPHORIC"].includes(sentiment)) {
                const result = { sentiment, relevance, category, title, reasoning: json.reasoning };
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
