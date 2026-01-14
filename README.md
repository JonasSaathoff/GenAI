# IdeaForge – Multi-Expert Creative Graph

A local-first creative support tool that orchestrates multiple AI agents with domain-specific personas. Build spatial idea graphs using Inspire, Synthesize, Critique, and Refine agents.

📄 **For detailed documentation, see [report.tex](report.tex)**

---

## Quick Setup

### 1. Prerequisites
- **Node.js** 18+
- **Ollama** running locally

### 2. Install Ollama Model
```bash
ollama pull mistral
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment
Create a `.env` file:
```bash
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral

# Optional cloud fallbacks:
# GEMINI_API_KEY=your_key
# OPENAI_API_KEY=your_key
```

### 5. Run
```bash
npm start
```

Open **http://localhost:3000**

---

## Basic Usage

1. **Select a domain** (General / Story / Business) to adapt AI personas
2. **Add ideas** using the input field or AI agents:
   - **Inspire** → 3 divergent ideas from selected node
   - **Synthesize** → Merge 2-3 nodes into one
   - **Critique** → Identify 3 flaws/risks
   - **Refine** → Generate concise title
3. **Save/Load** projects locally
4. **Export** as JSON, Markdown, CSV, or PNG

---

## Project Structure
```
├── server.js       # Express backend, AI routing
├── public/
│   ├── index.html  # UI layout
│   ├── app.js      # Graph visualization & logic
│   └── styles.css  # Styling
├── report.tex      # Full documentation
└── package.json
```

---

**Note:** Works fully offline with Ollama. Cloud providers (Gemini/OpenAI) are optional fallbacks.
