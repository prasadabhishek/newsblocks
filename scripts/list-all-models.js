import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
async function run() {
    // try to fetch from REST
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await res.json();
    if(data.models) {
        data.models.forEach(m => console.log(m.name, m.supportedGenerationMethods.join(',')));
    } else {
        console.log(data);
    }
}
run();
