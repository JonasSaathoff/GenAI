# IdeaForge

A small Git-inspired creative support tool for ideation, branching, and synthesis. This scaffold implements:

- A minimal Express backend providing three AI endpoints: `/api/inspire`, `/api/synthesize`, `/api/refine-title`.
- Exponential backoff for calls to the Gemini generative API.
- A single-page frontend using `vis-network` to render the idea graph and controls for New Idea, Inspire, Synthesize, Refine Title.

## Requirements
- Node.js 18+ recommended
- A Gemini API key with permission to call the chosen model

## Setup (macOS / zsh)

1. Install dependencies

```bash
cd /Users/jonassaathoff/Desktop/GENAI-PROJECT
npm install
```

2. Create a `.env` file with your Gemini key and optional overrides

```bash
cat > .env <<ENVEOF
GEMINI_API_KEY=your_api_key_here
# Optional:
# GEMINI_API_URL=https://api.generative.googleapis.com/v1/models
# GEMINI_MODEL=gemini-2.0-flash
ENVEOF
```

3. Run the server

```bash
npm start
```

4. Open the app in your browser:

http://localhost:3000

## Features

- **New Idea**: Add a new node to the idea tree
- **Inspire**: Generate creative variations on selected ideas
- **Synthesize**: Combine multiple selected ideas into one
- **Refine Title**: Auto-generate concise titles for ideas

## Notes

- The server uses exponential backoff for API reliability
- The frontend uses vis-network for interactive idea graph visualization
- Multiple API providers supported: Gemini, HuggingFace, OpenAI

## API Endpoints

- `POST /api/inspire` - Generate inspired variations
- `POST /api/synthesize` - Combine ideas
- `POST /api/refine-title` - Auto-generate titles
