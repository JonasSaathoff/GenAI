<<<<<<< HEAD
# IdeaForge

A small Git-inspired creative support tool for ideation, branching, and synthesis. This scaffold implements:

- A minimal Express backend providing three AI endpoints: `/api/inspire`, `/api/synthesize`, `/api/refine-title`.
- Exponential backoff for calls to the Gemini generative API.
- A single-page frontend using `vis-network` to render the idea graph and controls for New Idea, Inspire, Synthesize, Refine Title.

Requirements
- Node.js 18+ recommended
- A Gemini API key with permission to call the chosen model

Setup (macOS / zsh)

1. Install dependencies

```bash
cd /Users/jonassaathoff/Desktop/GENAI-PROJECT
npm install
```

2. Create a `.env` file with your Gemini key and optional overrides

```bash
cat > .env <<EOF
GEMINI_API_KEY=your_api_key_here
# Optional:
# GEMINI_API_URL=https://api.generative.googleapis.com/v1/models
# GEMINI_MODEL=gemini-2.5-flash-preview-09-2025
EOF
```

3. Run the server

```bash
npm start
```

4. Open the app in your browser:

http://localhost:3000

Notes & TODOs
- The server uses a generic request body for Gemini; depending on the exact REST schema you may need to adapt `server.js` to match the official Gemini request/response fields. The code includes extraction fallbacks.
- The frontend expects the API to return plain text (for `inspire`) or a `synthesized` string (for `synthesize`) and a `title` (for `refine-title`).

If you want, I can:
- Update the server to the exact Gemini REST schema if you provide the endpoint and sample payload/response.
- Add authentication and rate-limiting.
- Improve the graph UI (color legend, branch labels, draggable hierarchy, commit-like metadata UI).
=======
# GenAI
>>>>>>> origin/main
