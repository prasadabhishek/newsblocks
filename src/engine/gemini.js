import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { retry, hashString, robustParse, sleep } from "./utils.js";
import { Cache } from "./cache.js";
import { CONFIG } from "./config.js";

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
    MINIMAX_PRIMARY: "MiniMax-M2.7",
    OLLAMA_LLM: process.env.OLLAMA_MODEL || "gemma3:4b",
    OLLAMA_EMBED: "nomic-embed-text",
    EMBEDDING: "text-embedding-004"
};

const getProvider = () => process.env.AI_PROVIDER || "ollama";
const getOllamaHost = () => process.env.OLLAMA_HOST || "http://localhost:11434";

/**
 * AI Utility for News Map.
 * Supports Ollama (Local), Gemini, and MiniMax providers.
 */
export const AI = {
    /**
     * Internal helper to run a prompt with provider-specific logic.
     */
    async runWithFallback(prompt, retryDelay = 30000) {
        const provider = getProvider();
        await sleep(200); // Pacing

        if (provider === "ollama") {
            return this.runOllama(prompt, retryDelay);
        }
        if (provider === "minimax") {
            return this.runMiniMax(prompt, retryDelay);
        }

        // Default: Gemini
        return this.runGemini(prompt, retryDelay);
    },

    /**
     * Ollama Implementation (Local)
     */
    async runOllama(prompt, retryDelay) {
        try {
            console.log(`AI: Trying local Ollama (${MODELS.OLLAMA_LLM})...`);
            const response = await retry(() => axios.post(`${getOllamaHost()}/api/generate`, {
                model: MODELS.OLLAMA_LLM,
                prompt: prompt,
                stream: false,
                options: { temperature: 0.1 }
            }), 2, 5000);

            return response.data.response;
        } catch (e) {
            console.error(`AI: Ollama failed: ${e.message}. Falling back to Gemini...`);
            return this.runGemini(prompt, retryDelay);
        }
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
            const result = await retry(() => model.generateContent(prompt), 2, retryDelay); // Production retry
            return (await result.response).text();
        } catch (e) {
            console.error(`AI: Gemini primary failed: ${e.message}. Trying fallback...`);
            const model = getGenAI().getGenerativeModel({ model: MODELS.GEMINI_FALLBACK });
            const result = await retry(() => model.generateContent(prompt), 1, retryDelay);
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
            ), 2, retryDelay);

            return response.data.choices[0].message.content;
        } catch (e) {
            const errorMsg = e.response ? JSON.stringify(e.response.data) : e.message;
            console.error(`AI: MiniMax failed: ${errorMsg}. Falling back to Gemini...`);
            return this.runGemini(prompt, retryDelay);
        }
    },

    /**
     * Tries to get embeddings from Ollama with parallel batching and error isolation.
     * @param {Array} headlines - Array of headline strings.
     * @param {Array} indices - Indices of headlines in original array.
     * @param {Array} hashes - Hash keys for cache.
     * @returns {Array} - Results array with nulls for failed embeddings.
     */
    async tryOllamaEmbeddings(headlines, indices, hashes) {
        const results = new Array(headlines.length).fill(null);
        const CONCURRENCY = CONFIG.EMBEDDING_CONCURRENCY;

        for (let i = 0; i < headlines.length; i += CONCURRENCY) {
            const batchHeadlines = headlines.slice(i, i + CONCURRENCY);
            const batchIndices = indices.slice(i, i + CONCURRENCY);
            const batchHashes = hashes.slice(i, i + CONCURRENCY);

            await Promise.all(batchHeadlines.map(async (h, j) => {
                try {
                    const response = await axios.post(`${getOllamaHost()}/api/embeddings`, {
                        model: MODELS.OLLAMA_EMBED,
                        prompt: h
                    });
                    results[i + j] = response.data.embedding;
                    Cache.setEmbedding(batchHashes[j], response.data.embedding);
                } catch (e) {
                    // Individual failure - null result, don't throw
                    console.error(`Ollama embedding failed for headline ${i + j}: ${e.message}`);
                }
            }));
        }

        return results;
    },

    /**
     * Embeds headlines. Prioritizes Ollama (Local) if provider is ollama.
     * Uses parallel Ollama embeddings with error isolation, falls back to Gemini only for failed ones.
     */
    async embedBatchedHeadlines(headlines) {
        const hashes = headlines.map(h => hashString(h));
        const results = new Array(headlines.length).fill(null);
        const missingIndices = [];
        const missingHeadlines = [];
        const missingHashes = [];

        hashes.forEach((hash, i) => {
            const cached = Cache.getEmbedding(hash);
            if (cached) results[i] = cached;
            else {
                missingIndices.push(i);
                missingHeadlines.push(headlines[i]);
                missingHashes.push(hash);
            }
        });

        if (missingIndices.length === 0) return results;

        // Try Ollama first if it's the provider
        if (getProvider() === "ollama") {
            try {
                console.log(`AI: Fetching local embeddings for ${missingIndices.length} headlines with concurrency ${CONFIG.EMBEDDING_CONCURRENCY}...`);
                const ollamaResults = await this.tryOllamaEmbeddings(missingHeadlines, missingIndices, missingHashes);

                // Copy successful Ollama results
                let hasFailures = false;
                for (let i = 0; i < ollamaResults.length; i++) {
                    if (ollamaResults[i] !== null) {
                        results[missingIndices[i]] = ollamaResults[i];
                    } else {
                        hasFailures = true;
                    }
                }

                // If all succeeded, return
                if (!hasFailures) return results;

                console.log(`AI: Some Ollama embeddings failed, falling back to Gemini for failed ones.`);
            } catch (e) {
                console.error("Local Ollama embedding batch failed, falling back to Gemini:", e.message);
            }
        }

        // Gemini Fallback for failed embeddings only
        const stillMissingIndices = [];
        const stillMissingHeadlines = [];
        for (let i = 0; i < results.length; i++) {
            if (results[i] === null) {
                stillMissingIndices.push(missingIndices[i]);
                stillMissingHeadlines.push(missingHeadlines[i]);
            }
        }

        if (stillMissingIndices.length === 0) return results;

        if (!process.env.GEMINI_API_KEY) {
            console.warn("GEMINI_API_KEY not found. Using fallback clustering.");
            return results.every(r => r !== null) ? results : null;
        }

        try {
            const model = getGenAI().getGenerativeModel({ model: MODELS.EMBEDDING });
            const requests = stillMissingHeadlines.map(h => ({
                content: { parts: [{ text: h }] }
            }));

            console.log(`AI: Fetching Gemini embeddings for ${stillMissingHeadlines.length} failed headlines...`);
            const result = await retry(() => model.batchEmbedContents({ requests }), 2, 20000);

            if (result && result.embeddings) {
                result.embeddings.forEach((e, i) => {
                    const originalIndex = stillMissingIndices[i];
                    const val = e.values;
                    results[originalIndex] = val;
                    Cache.setEmbedding(missingHashes[missingIndices.indexOf(originalIndex)], val);
                });
            }
            return results.every(r => r !== null) ? results : null;
        } catch (e) {
            console.error("Gemini embedding failed:", e.message);
            return results.every(r => r !== null) ? results : null;
        }
    },

    /**
     * Analyzes sentiment.
     */
    async analyzeSentiment(headline) {
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
            const text = await this.runWithFallback(prompt, CONFIG.AI_REQUEST_TIMEOUT);
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
