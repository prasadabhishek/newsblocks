import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
    const models = ['text-embedding-004', 'embedding-001', 'models/text-embedding-004'];
    for (const m of models) {
        try {
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.batchEmbedContents({
                requests: [{ content: { parts: [{ text: "test" }] } }]
            });
            console.log(m, "SUCCESS", result.embeddings.length);
        } catch (e) {
            console.log(m, "FAILED", e.message);
        }
    }
}
run();
