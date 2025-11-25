import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = process.env.GEMINI_API_URL || 'https://api.generative.googleapis.com/v1/models';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-09-2025';

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY is not set. API calls will fail without it.');
}

async function exponentialBackoffFetch(url, options = {}, maxRetries = 5) {
  let attempt = 0;
  let baseDelay = 500; // ms
  while (true) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        // retry on server errors (5xx)
        if (res.status >= 500 && attempt < maxRetries) {
          throw new Error(`Server error ${res.status}`);
        }
      }
      return res;
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function callGemini(promptText, maxTokens = 320) {
  const url = `${GEMINI_API_URL}/${DEFAULT_MODEL}:generate`;
  const body = {
    // Simple generic request shape; adapt to your specific Gemini REST shape if different
    prompt: promptText,
    maxTokens,
    temperature: 0.9
  };

  const res = await exponentialBackoffFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GEMINI_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  // Attempt to extract text from possible response shapes
  // This may need editing to match your actual Gemini response schema
  if (json.output && typeof json.output === 'string') return json.output;
  if (json.candidates && Array.isArray(json.candidates) && json.candidates[0]) return json.candidates[0].content || json.candidates[0].text || JSON.stringify(json);
  if (json.choices && Array.isArray(json.choices) && json.choices[0]) return json.choices[0].text || JSON.stringify(json);
  return JSON.stringify(json);
}

// Endpoint: /api/inspire -> Given idea content return 3-line numbered list
app.post('/api/inspire', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const systemInstr = `You are a creative brainstorming partner. Given a single concept, generate three distinct, highly divergent, and novel ideas that branch from the original concept. Respond as a numbered list only.`;
    const prompt = `${systemInstr}\n\nConcept: ${content}\n\nRespond as:\n1. Idea one\n2. Idea two\n3. Idea three`;

    const output = await callGemini(prompt, 300);
    // Return raw text; frontend will parse numbered list
    res.json({ id: uuidv4(), raw: output });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Endpoint: /api/synthesize -> Given array of 2-3 concepts return single paragraph
app.post('/api/synthesize', async (req, res) => {
  try {
    const { concepts } = req.body;
    if (!Array.isArray(concepts) || concepts.length < 2) return res.status(400).json({ error: 'Provide 2 or 3 concepts' });

    const systemInstr = `You are a master concept synthesizer. Given a list of 2 or 3 distinct concepts, your task is to fuse them into a single, cohesive, and innovative new concept. The output must be a single, cohesive paragraph.`;
    const prompt = `${systemInstr}\n\nConcepts:\n${concepts.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nProvide one cohesive paragraph describing the synthesized idea.`;

    const output = await callGemini(prompt, 400);
    res.json({ id: uuidv4(), synthesized: output });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Endpoint: /api/refine-title -> Given long-form idea return short title (max 8 words)
app.post('/api/refine-title', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const systemInstr = `You are an expert copywriter. Condense the following long-form idea into an evocative, maximum 8-word title or summary. Respond with only the title.`;
    const prompt = `${systemInstr}\n\nLong-form idea:\n${content}\n\nRespond with only the title (max 8 words).`;

    const output = await callGemini(prompt, 40);
    // Strip quotes and newlines
    const title = (output || '').trim().split('\n')[0].replace(/^\"|\"$/g, '');
    res.json({ id: uuidv4(), title });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IdeaForge server listening on port ${PORT}`);
});
