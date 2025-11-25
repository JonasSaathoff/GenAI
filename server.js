import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

// If dotenv didn't populate HUGGINGFACE_API_KEY for any reason, attempt to read .env manually
try {
  if (!process.env.HUGGINGFACE_API_KEY) {
    const envPath = `${process.cwd()}/.env`;
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf8');
      const m = raw.match(/^HUGGINGFACE_API_KEY=(.+)$/m);
      if (m && m[1]) process.env.HUGGINGFACE_API_KEY = m[1].trim();
    }
  }
} catch (e) {
  // ignore manual parse errors
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// Default to the Generative Language v1beta endpoint which works with the
// `generateContent` path for many Gemini models (override via GEMINI_API_URL).
const GEMINI_API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
// Support alternate env var name `GENAI` if you stored the key under that name
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY || process.env.GENAI || '';
const HUGGINGFACE_DEFAULT_MODEL = process.env.HF_MODEL || 'gpt2';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY is not set. API calls will fail without it.');
}

// Brief startup info (do not print keys)
console.log('HUGGINGFACE_API_KEY present:', !!HUGGINGFACE_API_KEY, 'GEMINI_API_KEY present:', !!GEMINI_API_KEY);

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

async function callGemini(promptText, maxTokens = 320, model = DEFAULT_MODEL) {
  // Use the Generative Language `generateContent` shape which accepts `contents` with `parts`.
  const url = `${GEMINI_API_URL}/${model}:generateContent`;
  const body = {
    contents: [
      {
        parts: [{ text: promptText }]
      }
    ]
  };

  // Use API key header `X-goog-api-key` for API keys (starts with "AIza"), otherwise Bearer token.
  const headers = { 'Content-Type': 'application/json' };
  let fetchUrl = url;
  if (GEMINI_API_KEY) {
    if (GEMINI_API_KEY.startsWith('AIza')) {
      // use header instead of query param for the generativelanguage API
      headers['X-goog-api-key'] = GEMINI_API_KEY;
    } else {
      headers['Authorization'] = `Bearer ${GEMINI_API_KEY}`;
    }
  }

  const res = await exponentialBackoffFetch(fetchUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    // Preferred extraction for Generative Language responses
    if (json.candidates && Array.isArray(json.candidates) && json.candidates[0] && json.candidates[0].content) {
      const parts = json.candidates[0].content.parts || (json.candidates[0].content[0] && json.candidates[0].content[0].parts) || [];
      if (parts && parts[0] && parts[0].text) return parts[0].text;
    }
    // Fallbacks for other shapes
    if (json.output && Array.isArray(json.output) && json.output[0] && json.output[0].content && json.output[0].content[0]) {
      return json.output[0].content[0].text || JSON.stringify(json);
    }
    if (json.candidates && Array.isArray(json.candidates) && json.candidates[0] && json.candidates[0].text) return json.candidates[0].text;
    return JSON.stringify(json);
  } catch (err) {
    return text;
  }
}

// Generate a short title (max ~8 words) for long-form content using the
// same provider-selection logic as the /api/refine-title endpoint.
async function generateShortTitle(content) {
  const systemInstr = `You are an expert copywriter. Condense the following long-form idea into an evocative, maximum 8-word title or summary. Respond with only the title.`;
  const prompt = `Long-form idea:\n${content}\n\nRespond with only the title (max 8 words).`;
  const preferred = (process.env.PREFERRED_PROVIDER || '').toLowerCase();
  if (preferred === 'openai' || (!preferred && OPENAI_API_KEY && !GEMINI_API_KEY)) {
    return (await callOpenAI(systemInstr, prompt, 60)).trim().split('\n')[0].replace(/^"|"$/g, '').trim();
  } else if (preferred === 'huggingface' || (!preferred && HUGGINGFACE_API_KEY && !GEMINI_API_KEY && !OPENAI_API_KEY)) {
    return (await callHuggingFace(HUGGINGFACE_DEFAULT_MODEL, prompt, 40)).trim().split('\n')[0].replace(/^"|"$/g, '').trim();
  } else {
    return (await callGemini(prompt, 40, process.env.GEMINI_MODEL || DEFAULT_MODEL)).trim().split('\n')[0].replace(/^"|"$/g, '').trim();
  }
}

async function callHuggingFace(model, inputText, maxTokens = 200) {
  // Use the HF router endpoint for inference routing.
  const url = `https://router.huggingface.co/models/${model}`;
  const body = { inputs: inputText, parameters: { max_new_tokens: maxTokens, temperature: 0.9 } };

  const res = await exponentialBackoffFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    // Return an error that includes the status and body so callers can surface it
    throw new Error(`HuggingFace ${res.status}: ${text}`);
  }

  // Try to parse JSON response and extract common fields
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j) && j[0] && j[0].generated_text) return j[0].generated_text;
    if (j.generated_text) return j.generated_text;
    if (j.error) throw new Error('HuggingFace error: ' + j.error);
    return JSON.stringify(j);
  } catch (e) {
    // Not JSON — return raw text
    return text;
  }
}

async function callOpenAI(systemInstruction, userContent, maxTokens = 320) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const body = {
    model: OPENAI_DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userContent }
    ],
    max_tokens: maxTokens,
    temperature: 0.9
  };

  const res = await exponentialBackoffFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json.choices && Array.isArray(json.choices) && json.choices[0] && json.choices[0].message) {
      return json.choices[0].message.content;
    }
    return JSON.stringify(json);
  } catch (e) {
    return text;
  }
}

// Endpoint: /api/inspire -> Given idea content return 3-line numbered list
app.post('/api/inspire', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing content' });

    const systemInstr = `You are a creative brainstorming partner. Given a single concept, generate three distinct, highly divergent, and novel ideas that branch from the original concept. Respond as a numbered list only.`;
    const prompt = `${systemInstr}\n\nConcept: ${content}\n\nRespond as:\n1. Idea one\n2. Idea two\n3. Idea three`;
    // Choose preferred provider: honor PREFERRED_PROVIDER or prefer Gemini when key present.
    const preferred = (process.env.PREFERRED_PROVIDER || '').toLowerCase();
    let output;
    if (preferred === 'openai' || (!preferred && OPENAI_API_KEY && !GEMINI_API_KEY)) {
      output = await callOpenAI(systemInstr, `Concept: ${content}\n\nRespond as:\n1. Idea one\n2. Idea two\n3. Idea three`, 300);
    } else if (preferred === 'huggingface' || (!preferred && HUGGINGFACE_API_KEY && !GEMINI_API_KEY && !OPENAI_API_KEY)) {
      output = await callHuggingFace(HUGGINGFACE_DEFAULT_MODEL, prompt, 200);
    } else {
      output = await callGemini(prompt, 300, process.env.GEMINI_MODEL || DEFAULT_MODEL);
    }
    // Parse numbered list into items and generate short titles for each.
    const parseNumberedList = (txt) => {
      const lines = (txt || '').split('\n');
      const items = [];
      let current = '';
      for (const l of lines) {
        const m = l.match(/^\s*\d+\.\s*(.*)$/);
        if (m) {
          if (current) items.push(current.trim());
          current = m[1] || '';
        } else {
          if (!l.trim()) continue;
          current = (current + ' ' + l.trim()).trim();
        }
      }
      if (current) items.push(current.trim());
      return items;
    };

    const items = parseNumberedList(output);
    const titles = await Promise.all(items.map(it => generateShortTitle(it).catch(e => (it.split('\n')[0] || '').slice(0, 40))));
    const ideas = items.map((it, idx) => ({ id: uuidv4(), text: it, title: titles[idx] || '' }));
    res.json({ id: uuidv4(), raw: output, ideas });
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
    const preferred = (process.env.PREFERRED_PROVIDER || '').toLowerCase();
    let output;
    if (preferred === 'openai' || (!preferred && OPENAI_API_KEY && !GEMINI_API_KEY)) {
      output = await callOpenAI(systemInstr, `${concepts.map((c, i) => `${i + 1}. ${c}`).join('\n')}`, 400);
    } else if (preferred === 'huggingface' || (!preferred && HUGGINGFACE_API_KEY && !GEMINI_API_KEY && !OPENAI_API_KEY)) {
      output = await callHuggingFace(HUGGINGFACE_DEFAULT_MODEL, prompt, 300);
    } else {
      output = await callGemini(prompt, 400, process.env.GEMINI_MODEL || DEFAULT_MODEL);
    }
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
    const preferred = (process.env.PREFERRED_PROVIDER || '').toLowerCase();
    let output;
    if (preferred === 'openai' || (!preferred && OPENAI_API_KEY && !GEMINI_API_KEY)) {
      output = await callOpenAI(systemInstr, `Long-form idea:\n${content}\n\nRespond with only the title (max 8 words).`, 60);
    } else if (preferred === 'huggingface' || (!preferred && HUGGINGFACE_API_KEY && !GEMINI_API_KEY && !OPENAI_API_KEY)) {
      output = await callHuggingFace(HUGGINGFACE_DEFAULT_MODEL, prompt, 40);
    } else {
      output = await callGemini(prompt, 40, process.env.GEMINI_MODEL || DEFAULT_MODEL);
    }
    // Strip quotes and newlines
    const title = (output || '').trim().split('\n')[0].replace(/^\"|\"$/g, '');
    res.json({ id: uuidv4(), title });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Debug endpoint: test Gemini directly (bypass OPENAI/HF fallbacks)
app.get('/api/test-gemini', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) return res.status(400).json({ error: 'GEMINI_API_KEY not set in environment' });
    // Allow an optional prompt query param; fallback to a tiny sanity check prompt
      const prompt = req.query.prompt || 'Provide a one-sentence test response saying hello.';
      const model = req.query.model || undefined;
      const output = await callGemini(prompt, 200, model);
    res.json({ ok: true, raw: output });
  } catch (err) {
    console.error('test-gemini error', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IdeaForge server listening on port ${PORT}`);
});
