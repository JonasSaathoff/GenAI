import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import multer from 'multer';

dotenv.config();

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'ideaforge' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Initialize SQLite database
const db = new Database('ideaforge.db');
db.pragma('journal_mode = WAL');

// Create projects table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ideaTree TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
`);

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
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for GET requests to projects (load operations)
    return req.method === 'GET' && req.path.startsWith('/api/projects');
  }
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit AI endpoints to 10 requests per minute
  message: 'Too many AI requests, please slow down.',
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

app.use('/api/', apiLimiter);
app.use('/api/inspire', aiLimiter);
app.use('/api/synthesize', aiLimiter);
app.use('/api/refine-title', aiLimiter);

// Multer setup for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'));
    }
  }
});

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
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY is not set. API calls will fail without it.');
}

// Brief startup info (do not print keys)
console.log('HUGGINGFACE_API_KEY present:', !!HUGGINGFACE_API_KEY, 'GEMINI_API_KEY present:', !!GEMINI_API_KEY);

// ============================================================================
// MULTI-EXPERT PERSONA LIBRARY
// Different domains use specialized prompts to demonstrate multi-expert system
// ============================================================================
const PROMPTS = {
  general: {
    inspire: "You are a concise creative partner. Generate exactly three short ideas (1-2 sentences max each), highly divergent from the original concept. Respond only as a numbered list, no extra text.",
    synthesize: "You are a concise synthesizer. Given 2-3 concepts, fuse them into a single concept in one short paragraph (4-6 sentences max). Be concrete, avoid fluff.",
    critique: "You are a strict, constructive critic (Devil's Advocate). Identify exactly 3 potential flaws, risks, or clichés in the user's concept. Be concise.",
    refine: "You are a concise copywriter. Produce an evocative title of at most 8 words that captures the essence of the content. Respond with only the title, no quotes."
  },
  story: {
    inspire: "You are a plot consultant. Generate exactly three COMPLETELY DIFFERENT and DIVERGENT plot directions or character arcs based on this concept. Each idea must be a distinct alternative path, NOT a continuation of the others. Focus on narrative tension and make them mutually exclusive. Respond only as a numbered list.",
    synthesize: "You are a master editor. Merge these plot points into a single, cohesive story synopsis (4-6 sentences). Ensure a clear beginning, middle, and end.",
    critique: "You are a literary critic. Identify exactly 3 plot holes, weak character motivations, or narrative clichés in this concept.",
    refine: "You are a novelist. Create a compelling chapter title or story hook (max 8 words) that captures the dramatic essence."
  },
  business: {
    inspire: "You are a disruptive innovator. Generate exactly three COMPLETELY DIFFERENT and DIVERGENT business models or value propositions based on this sector. Each idea must be a distinct alternative approach, NOT variations of the same model. Focus on scalability and market gaps. Make them mutually exclusive. Respond only as a numbered list.",
    synthesize: "You are a product manager. Fuse these features into a single Unique Value Proposition (UVP) or elevator pitch (4-6 sentences). Focus on customer benefit.",
    critique: "You are a venture capitalist. Identify exactly 3 market risks, monetization challenges, or competitive threats in this business concept.",
    refine: "You are a marketing strategist. Create a punchy tagline or value proposition (max 8 words) that sells the idea."
  }
};


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
  if (preferred === 'ollama') {
    return (await callOllama(prompt, 60, OLLAMA_MODEL)).trim().split('\n')[0].replace(/^"|"$/g, '').trim();
  } else if (preferred === 'openai' || (!preferred && OPENAI_API_KEY && !GEMINI_API_KEY)) {
    return (await callOpenAI(systemInstr, prompt, 60)).trim().split('\n')[0].replace(/^"|"$/g, '').trim();
  } else if (preferred === 'huggingface' || (!preferred && HUGGINGFACE_API_KEY && !GEMINI_API_KEY && !OPENAI_API_KEY)) {
    return (await callHuggingFace(HUGGINGFACE_DEFAULT_MODEL, prompt, 40)).trim().split('\n')[0].replace(/^"|"$/g, '').trim();
  } else {
    return (await callGemini(prompt, 40, process.env.GEMINI_MODEL || DEFAULT_MODEL)).trim().split('\n')[0].replace(/^"|"$/g, '').trim();
  }
}

async function callHuggingFace(model, inputText, maxTokens = 200) {
  // Use the HF router endpoint with task-specific routing
  const url = `https://router.huggingface.co/models/${model}`;
  // For text-generation models, send text_inputs for better compatibility
  const body = { inputs: inputText, parameters: { max_new_tokens: maxTokens, temperature: 0.7 } };

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

async function callOllama(promptText, maxTokens = 200, model = OLLAMA_MODEL) {
  const url = `${OLLAMA_URL}/api/generate`;
  const body = {
    model: model,
    prompt: promptText,
    stream: false,
    options: {
      num_predict: maxTokens,  // Remove the Math.min cap to allow full token limit
      temperature: 0.7  // Slightly higher temperature for more creative output
    }
  };

  const res = await exponentialBackoffFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${text}`);
  }

  try {
    const json = JSON.parse(text);
    return json.response || text;
  } catch (e) {
    return text;
  }
}

// Endpoint: /api/inspire -> Given idea content return 3-line numbered list
// ============================================================================
// ENDPOINT 1: /api/inspire
// STRATEGY: Use "Creative/Divergent" Model (OpenAI or Gemini)
// Rationale: High temperature creative divergence benefits from chat-tuned models.
// ============================================================================
app.post('/api/inspire', async (req, res) => {
  try {
    const { content, domain = 'general' } = req.body;
    if (!content) {
      logger.warn('Inspire request missing content');
      return res.status(400).json({ error: 'Missing content', code: 'MISSING_CONTENT' });
    }

    // Select persona based on domain
    const persona = PROMPTS[domain] || PROMPTS.general;
    const systemInstr = persona.inspire;
    const prompt = `${systemInstr}\n\nConcept: ${content}\n\nRespond format strictly:\n1. Idea one (<= 2 sentences)\n2. Idea two (<= 2 sentences)\n3. Idea three (<= 2 sentences)`;
    
    let output;
    
    // TASK-SPECIFIC ORCHESTRATION: Inspire uses Ollama (local, fast creative agent)
    // Fallback order: Ollama -> Gemini -> OpenAI
    try {
      if (process.env.OLLAMA_URL) {
        logger.info('Orchestrator: Routing "inspire" to Ollama (Local Creative Agent - PREFERRED)');
        output = await callOllama(prompt, 1000, OLLAMA_MODEL); 
      } else if (GEMINI_API_KEY) {
        logger.info('Orchestrator: Routing "inspire" to Gemini (Fallback Creative Agent)');
        output = await callGemini(prompt, 1000, process.env.GEMINI_MODEL || DEFAULT_MODEL); 
      } else if (OPENAI_API_KEY) {
        logger.info('Orchestrator: Routing "inspire" to OpenAI (Final Fallback)');
        output = await callOpenAI(systemInstr, `Concept: ${content}\n\nRespond format strictly:\n1. Idea one (<= 2 sentences)\n2. Idea two (<= 2 sentences)\n3. Idea three (<= 2 sentences)`, 1000); 
      } else {
        throw new Error('No AI provider available');
      }
    } catch (apiErr) {
      logger.error('AI API call failed', { error: apiErr.message, content: content.slice(0, 50) });
      return res.status(503).json({ 
        error: 'AI service temporarily unavailable', 
        code: 'AI_SERVICE_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'Please try again later.' : apiErr.message
      });
    }

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
    if (items.length === 0) {
      logger.warn('No items parsed from AI output', { output: output.slice(0, 100) });
      return res.status(502).json({ 
        error: 'Failed to parse AI response', 
        code: 'PARSE_ERROR' 
      });
    }

    const titles = await Promise.all(items.map(it => 
      generateShortTitle(it).catch(e => {
        logger.error('Title generation failed', { error: e.message });
        return (it.split('\n')[0] || '').slice(0, 80);
      })
    ));
    
    const ideas = items.map((it, idx) => ({ id: uuidv4(), text: it, title: titles[idx] || '' }));
    logger.info('Inspire endpoint success', { itemCount: ideas.length });
    res.json({ id: uuidv4(), raw: output, ideas });
  } catch (err) {
    logger.error('Inspire endpoint error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// Endpoint: /api/synthesize -> Given array of 2-3 concepts return single paragraph
// ============================================================================
// ENDPOINT 2: /api/synthesize
// STRATEGY: Use "Reasoning" Model (Gemini 2.0 / Pro)
// Rationale: Merging concepts requires high reasoning capabilities and context.
// ============================================================================
app.post('/api/synthesize', async (req, res) => {
  try {
    const { concepts, domain = 'general' } = req.body;
    if (!Array.isArray(concepts) || concepts.length < 2) {
      logger.warn('Synthesize request invalid', { conceptCount: concepts?.length });
      return res.status(400).json({ error: 'Provide 2 or 3 concepts', code: 'INVALID_INPUT' });
    }

    // Select persona based on domain
    const persona = PROMPTS[domain] || PROMPTS.general;
    const systemInstr = persona.synthesize;
    const prompt = `${systemInstr}\n\nConcepts:\n${concepts.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nOutput: one short cohesive paragraph (<= 6 sentences).`;
    
    let output;
    
    // TASK-SPECIFIC ORCHESTRATION: Synthesize uses Gemini (cloud reasoning agent - PREFERRED)
    // Auto-fallback to Ollama if Gemini fails (no tokens/API issues)
    try {
      if (GEMINI_API_KEY) {
        try {
          logger.info('Orchestrator: Routing "synthesize" to Gemini (Cloud Reasoning Agent - PREFERRED)');
          output = await callGemini(prompt, 200, process.env.GEMINI_MODEL || DEFAULT_MODEL);
        } catch (geminiErr) {
          logger.warn('Gemini failed, auto-switching to Ollama', { error: geminiErr.message });
          if (process.env.OLLAMA_URL) {
            logger.info('Orchestrator: Auto-fallback "synthesize" to Ollama (Local Reasoning Agent)');
            output = await callOllama(prompt, 200, OLLAMA_MODEL);
          } else {
            throw geminiErr; // Re-throw if no Ollama available
          }
        }
      } else if (process.env.OLLAMA_URL) {
        logger.info('Orchestrator: Routing "synthesize" to Ollama (No Gemini key available)');
        output = await callOllama(prompt, 200, OLLAMA_MODEL);
      } else if (OPENAI_API_KEY) {
        logger.info('Orchestrator: Routing "synthesize" to OpenAI (Final Fallback)');
        output = await callOpenAI(systemInstr, `${concepts.map((c, i) => `${i + 1}. ${c}`).join('\n')}`, 200);
      } else {
        throw new Error('No AI provider available');
      }
    } catch (apiErr) {
      logger.error('AI API call failed on synthesize', { error: apiErr.message });
      return res.status(503).json({ 
        error: 'AI service temporarily unavailable', 
        code: 'AI_SERVICE_ERROR'
      });
    }
    
    logger.info('Synthesize endpoint success', { conceptCount: concepts.length });
    res.json({ id: uuidv4(), synthesized: output });
  } catch (err) {
    logger.error('Synthesize endpoint error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ============================================================================
// ENDPOINT 4: /api/critique (NEW - Critical Agent)
// STRATEGY: Use "Reasoning/Critical" Model (Gemini or Ollama)
// Rationale: Critical analysis requires logic and safety filtering.
// ============================================================================
app.post('/api/critique', async (req, res) => {
  try {
    const { content, domain = 'general' } = req.body;
    if (!content) {
      logger.warn('Critique request missing content');
      return res.status(400).json({ error: 'Missing content', code: 'MISSING_CONTENT' });
    }

    // Select persona based on domain
    const persona = PROMPTS[domain] || PROMPTS.general;
    const systemInstr = persona.critique;
    const prompt = `${systemInstr}\n\nConcept:\n${content}\n\nOutput format:\n1. [Flaw/Risk]\n2. [Flaw/Risk]\n3. [Flaw/Risk]`;

    let output;

    // TASK-SPECIFIC ORCHESTRATION: Critique uses Gemini (cloud critical reasoning - PREFERRED)
    // Auto-fallback to Ollama if Gemini fails (no tokens/API issues)
    try {
      if (GEMINI_API_KEY) {
        try {
          logger.info('Orchestrator: Routing "critique" to Gemini (Cloud Critical Agent - PREFERRED)');
          output = await callGemini(prompt, 200, process.env.GEMINI_MODEL || DEFAULT_MODEL);
        } catch (geminiErr) {
          logger.warn('Gemini failed, auto-switching to Ollama', { error: geminiErr.message });
          if (process.env.OLLAMA_URL) {
            logger.info('Orchestrator: Auto-fallback "critique" to Ollama (Local Critical Agent)');
            output = await callOllama(prompt, 200, OLLAMA_MODEL);
          } else {
            throw geminiErr; // Re-throw if no Ollama available
          }
        }
      } else if (process.env.OLLAMA_URL) {
        logger.info('Orchestrator: Routing "critique" to Ollama (No Gemini key available)');
        output = await callOllama(prompt, 200, OLLAMA_MODEL);
      } else if (OPENAI_API_KEY) {
        logger.info('Orchestrator: Routing "critique" to OpenAI (Final Fallback)');
        output = await callOpenAI(systemInstr, `Concept:\n${content}\n\nOutput format:\n1. [Flaw]\n2. [Flaw]\n3. [Flaw]`, 200);
      } else {
        throw new Error('No AI provider available');
      }
    } catch (apiErr) {
      logger.error('Critique API error', { error: apiErr.message });
      return res.status(503).json({ 
        error: 'AI service temporarily unavailable', 
        code: 'AI_SERVICE_ERROR' 
      });
    }

    // Parse numbered list (same logic as inspire endpoint to handle multi-line items)
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

    const critiquePoints = parseNumberedList(output).slice(0, 3);
    
    // If parsing fails, return raw text chunked
    const finalPoints = critiquePoints.length > 0 ? critiquePoints : [output.slice(0, 100) + '...'];

    logger.info('Critique endpoint success', { pointCount: finalPoints.length });
    res.json({ id: uuidv4(), critique: finalPoints });
  } catch (err) {
    logger.error('Critique endpoint error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// Endpoint: /api/refine-title -> Given long-form idea return short title (max 8 words)
// ============================================================================
// ENDPOINT 3: /api/refine-title
// STRATEGY: Use "Fast/Linguistic" Model (Ollama local or Gemini)
// Rationale: A small model is sufficient for summarization and faster/cheaper.
// ============================================================================
app.post('/api/refine-title', async (req, res) => {
  try {
    const { content, domain = 'general' } = req.body;
    if (!content) {
      logger.warn('Refine-title request missing content');
      return res.status(400).json({ error: 'Missing content', code: 'MISSING_CONTENT' });
    }

    // Select persona based on domain
    const persona = PROMPTS[domain] || PROMPTS.general;
    const systemInstr = persona.refine;
    const prompt = `${systemInstr}\n\nLong-form idea:\n${content}\n\nOutput: title only (<= 8 words).`;
    
    let output;
    
    // TASK-SPECIFIC ORCHESTRATION: Refine uses Ollama (local, fast linguistic agent - PREFERRED)
    // Fallback order: Ollama -> Gemini -> OpenAI
    try {
      if (process.env.OLLAMA_URL) {
        logger.info('Orchestrator: Routing "refine-title" to Ollama (Local Linguistic Agent - PREFERRED)');
        output = await callOllama(prompt, 40, OLLAMA_MODEL);
      } else if (GEMINI_API_KEY) {
        logger.info('Orchestrator: Routing "refine-title" to Gemini (Fallback Linguistic Agent)');
        output = await callGemini(prompt, 30, process.env.GEMINI_MODEL || DEFAULT_MODEL);
      } else if (OPENAI_API_KEY) {
        logger.info('Orchestrator: Routing "refine-title" to OpenAI (Final Fallback)');
        output = await callOpenAI(systemInstr, `Long-form idea:\n${content}\n\nOutput: title only (<= 8 words).`, 40);
      } else {
        throw new Error('No AI provider available');
      }
    } catch (apiErr) {
      logger.error('AI API call failed on refine-title', { error: apiErr.message });
      return res.status(503).json({ 
        error: 'AI service temporarily unavailable', 
        code: 'AI_SERVICE_ERROR'
      });
    }
    
    const title = (output || '').trim().split('\n')[0].replace(/^\"|\"$/g, '');
    logger.info('Refine-title endpoint success');
    res.json({ id: uuidv4(), title });
  } catch (err) {
    logger.error('Refine-title endpoint error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
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

// Project persistence endpoints
app.post('/api/projects', (req, res) => {
  try {
    const { id, name, ideaTree } = req.body;
    if (!id || !name || !ideaTree) {
      logger.warn('Save project request invalid fields', { hasId: !!id, hasName: !!name, hasTree: !!ideaTree });
      return res.status(400).json({ error: 'Missing id, name, or ideaTree', code: 'INVALID_INPUT' });
    }
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO projects (id, name, ideaTree, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, name, JSON.stringify(ideaTree), now, now);
    logger.info('Project saved', { id, name });
    res.json({ id, name, savedAt: now });
  } catch (err) {
    logger.error('Save project error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to save project', code: 'DATABASE_ERROR' });
  }
});

app.get('/api/projects', (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, name, createdAt, updatedAt FROM projects ORDER BY updatedAt DESC');
    const projects = stmt.all();
    logger.info('Projects listed', { count: projects.length });
    res.json({ projects });
  } catch (err) {
    logger.error('List projects error', { error: err.message });
    res.status(500).json({ error: 'Failed to load projects', code: 'DATABASE_ERROR' });
  }
});

app.get('/api/projects/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid project ID', code: 'INVALID_ID' });
    }
    const stmt = db.prepare('SELECT id, name, ideaTree, createdAt, updatedAt FROM projects WHERE id = ?');
    const project = stmt.get(id);
    if (!project) {
      logger.warn('Project not found', { id });
      return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' });
    }
    project.ideaTree = JSON.parse(project.ideaTree);
    logger.info('Project loaded', { id });
    res.json(project);
  } catch (err) {
    logger.error('Load project error', { error: err.message });
    res.status(500).json({ error: 'Failed to load project', code: 'DATABASE_ERROR' });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid project ID', code: 'INVALID_ID' });
    }
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) {
      logger.warn('Project delete failed - not found', { id });
      return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' });
    }
    logger.info('Project deleted', { id });
    res.json({ id, deleted: true });
  } catch (err) {
    logger.error('Delete project error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete project', code: 'DATABASE_ERROR' });
  }
});

// Export endpoints
app.get('/api/export/:id/json', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT id, name, ideaTree, createdAt, updatedAt FROM projects WHERE id = ?');
    const project = stmt.get(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' });
    }
    project.ideaTree = JSON.parse(project.ideaTree);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}.json"`);
    logger.info('Project exported as JSON', { id, name: project.name });
    res.json(project);
  } catch (err) {
    logger.error('Export JSON error', { error: err.message });
    res.status(500).json({ error: 'Failed to export', code: 'EXPORT_ERROR' });
  }
});

app.get('/api/export/:id/markdown', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT id, name, ideaTree FROM projects WHERE id = ?');
    const project = stmt.get(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' });
    }
    const ideaTree = JSON.parse(project.ideaTree);
    
    // Build markdown tree
    const buildMarkdownTree = (nodes) => {
      let markdown = `# ${project.name}\n\n`;
      
      // Find root nodes
      const rootNodes = nodes.filter(n => !n.parentId);
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      
      const renderNode = (node, depth = 0) => {
        const indent = '  '.repeat(depth);
        markdown += `${indent}- **${node.title || node.label}**\n`;
        if (node.content && node.content !== node.title) {
          markdown += `${indent}  ${node.content}\n`;
        }
        markdown += '\n';
        
        // Find and render children
        const children = nodes.filter(n => n.parentId === node.id);
        children.forEach(child => renderNode(child, depth + 1));
      };
      
      rootNodes.forEach(node => renderNode(node, 0));
      return markdown;
    };
    
    const markdown = buildMarkdownTree(ideaTree);
    
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}.md"`);
    logger.info('Project exported as Markdown', { id, name: project.name });
    res.send(markdown);
  } catch (err) {
    logger.error('Export Markdown error', { error: err.message });
    res.status(500).json({ error: 'Failed to export', code: 'EXPORT_ERROR' });
  }
});

app.get('/api/export/:id/csv', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT id, name, ideaTree FROM projects WHERE id = ?');
    const project = stmt.get(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' });
    }
    const ideaTree = JSON.parse(project.ideaTree);
    
    // Build CSV
    const escapeCSV = (str) => {
      if (!str) return '""';
      const escaped = String(str).replace(/"/g, '""');
      return `"${escaped}"`;
    };
    
    let csv = 'ID,Title,Content,Parent ID,Branch Color,Level,Timestamp\n';
    ideaTree.forEach(node => {
      csv += `${escapeCSV(node.id)},${escapeCSV(node.title || node.label)},${escapeCSV(node.content)},${escapeCSV(node.parentId || '')},${escapeCSV(node.branchColor)},${node.level || 0},${node.timestamp || ''}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}.csv"`);
    logger.info('Project exported as CSV', { id, name: project.name });
    res.send(csv);
  } catch (err) {
    logger.error('Export CSV error', { error: err.message });
    res.status(500).json({ error: 'Failed to export', code: 'EXPORT_ERROR' });
  }
});

// Import endpoint
app.post('/api/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded', code: 'NO_FILE' });
    }
    
    const fileContent = req.file.buffer.toString('utf-8');
    let projectData;
    
    try {
      projectData = JSON.parse(fileContent);
    } catch (parseErr) {
      logger.warn('Import failed - invalid JSON', { error: parseErr.message });
      return res.status(400).json({ error: 'Invalid JSON file', code: 'INVALID_JSON' });
    }
    
    // Validate structure
    if (!projectData.ideaTree || !Array.isArray(projectData.ideaTree)) {
      return res.status(400).json({ error: 'Invalid project structure - missing ideaTree', code: 'INVALID_STRUCTURE' });
    }
    
    // Generate new ID for imported project
    const newId = uuidv4();
    const newName = projectData.name ? `${projectData.name} (imported)` : 'Imported Project';
    const now = Date.now();
    
    const stmt = db.prepare(`
      INSERT INTO projects (id, name, ideaTree, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(newId, newName, JSON.stringify(projectData.ideaTree), now, now);
    
    logger.info('Project imported', { id: newId, name: newName, nodeCount: projectData.ideaTree.length });
    res.json({ 
      id: newId, 
      name: newName, 
      ideaTree: projectData.ideaTree,
      imported: true 
    });
  } catch (err) {
    logger.error('Import error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Failed to import project', code: 'IMPORT_ERROR' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`IdeaForge server listening on port ${PORT}`);
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack, 
    path: req.path,
    method: req.method 
  });
  res.status(500).json({ 
    error: 'Internal server error', 
    code: 'INTERNAL_ERROR',
    requestId: uuidv4()
  });
});
