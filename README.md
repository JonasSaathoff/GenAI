# IdeaForge – Multi-Expert Creative Graph

A hybrid AI creative support tool that orchestrates multiple AI agents to help you brainstorm, refine, and connect ideas. It creates spatial idea graphs using Inspire, Synthesize, Critique, and Refine agents, leveraging a **Smart Hybrid Architecture** that combines the speed and quality of Cloud AI (Gemini 2.0 Flash) with the reliability and privacy of Local AI (Ollama).

---

## Key Features

- **Smart Hybrid Engine**: Primarily uses **Gemini 2.0 Flash** for high-quality responses. If the API quota is exhausted, it automatically relies on **Ollama (Mistral)** running locally, ensuring uninterrupted workflows.
- **Context-Aware Agents (RAG-Lite)**: Agents don't just see the single node you selected; they analyze the entire lineage path of the idea to provide contextually relevant suggestions.
- **Dynamic Personas**: Go beyond preset domains. Define any **Custom Role** (e.g., "Skeptical V.C.", "Sci-Fi Author", "UX Researcher") to shape the AI's perspective instantly.
- **Spatial Graph Interface**: Visual node-based interface for divergent (Inspire) and convergent (Synthesize) thinking.

---

## Quick Setup

### 1. Prerequisites
- **Node.js** 18+
- **Ollama** running locally (for offline capability and fallback)
- **Google Gemini API Key** (for primary high-speed model)

### 2. Install Ollama Model
```bash
ollama pull mistral
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment
Create a `.env` file in the root directory:
```bash
# Primary Cloud Model (Recommended for best performance)
GEMINI_API_KEY=your_gemini_api_key_here

# Local Fallback Model
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral
```

### 5. Run Application
```bash
npm start
```
Open **http://localhost:3000** in your browser.

---

## Usage Guide

1. **Select a Perspective**:
   - Choose a preset (General / Story / Business).
   - **OR** type a **Custom Role** (e.g., "Cyberpunk Architect") to override the preset persona and fully shift the AI's tone and expertise.

2. **Graph Operations**:
   - **Selection controls**: Click selects a single node; Shift/Cmd/Ctrl+Click toggles multi-select; click empty space clears selection.
   - **Inspire**: Select a node to generate 3 divergent concepts (uses ancestral context and respects Custom Role).
   - **Synthesize**: Select 2+ nodes to merge them into a coherent new concept.
   - **Critique**: Highlights 3 risks/flaws; nodes show the critique text directly with a warning icon.
   - **Refine**: Polish titles or simplify complex text.

3. **Management**:
   - Save/Load projects locally (JSON).
   - Export graph data as Markdown, CSV, or Image.

---

## Project Structure

```
├── server.js       # Express backend (Hybrid AI routing, Fallback logic)
├── public/
│   ├── index.html  # Graph UI & Custom Role input
│   ├── app.js      # Frontend logic, Context gathering, Vis.js graph
│   └── styles.css  # Styling
├── report.tex      # Research paper/Report (Local only)
└── package.json
```

---

**Note:** The system is designed to be resilient. If your Gemini API Limit is hit, the backend log will show a switch to Ollama for subsequent requests seamlessly.
