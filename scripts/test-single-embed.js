import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
model.embedContent('test')
  .then(r => console.log('SUCCESS embedContent, length:', r.embedding.values.length))
  .catch(e => console.log('FAILED embedContent:', e.message));
