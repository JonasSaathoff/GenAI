# IdeaForge – Multi-Expert Creative Graph

A local-first creative support tool that orchestrates multiple AI agents (Inspire, Synthesize, Refine, Critique) with domain-specific personas. Demonstrates a multi-expert architecture running fully on Ollama for offline use, with Gemini and OpenAI as optional fallbacks.

📄 Read the report in [report.tex](report.tex)

## Overview

IdeaForge turns linear chat into a spatial graph so you can:
- **Diverge:** Generate 3 alternative ideas from any node (Inspire)
- **Converge:** Merge 2–3 nodes into one cohesive concept (Synthesize)
- **Evaluate:** Add 3 targeted risks or flaws (Critique)
- **Refine:** Produce concise (≤ 8-word) titles (Refine Title)
- **Contextualize:** Switch domains (General, Story, Business) to adapt AI personas
- **Export:** Save as JSON, Markdown, CSV, or high-res PNG

## Project Structure

```
├── server.js                 # Express backend, AI orchestration, persistence
├── public/
│   ├── index.html            # UI layout and controls
│   ├── app.js                # vis-network graph, AI actions, exports
│   └── styles.css            # Styling (palette configured in JS)
├── report.tex                # Project write-up
├── package.json              # Dependencies
├── ideaforge.db              # SQLite database (created at runtime)
└── README.md                 # Project documentation
```

## Installation & Setup

### 1) Prerequisites
- Node.js 18 or higher
- Ollama running locally

### 2) Model Setup
Install Ollama and pull the model used for orchestration (e.g., Mistral):

```bash
ollama pull mistral
```

### 3) Install Dependencies

```bash
npm install
```

### 4) Configuration
Create a `.env` file in the project root:

```bash
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral

# Optional: cloud fallbacks
# GEMINI_API_KEY=your_gemini_key
# OPENAI_API_KEY=your_openai_key
```

### 5) Run the Server

```bash
npm start
```

Then open http://localhost:3000

## Usage Guide

### Domain Selection
- ⚡ General: Broad creative partner
- 📖 Story: Plot Consultant, Master Editor, Literary Critic
- 🚀 Business: Disruptive Innovator, Product Manager, Venture Capitalist

### Creative Actions
- **New Idea:** Create a root or child node
- **Inspire:** Select 1 node → generates 3 divergent branches (auto-spaced)
- **Synthesize:** Select 2–3 nodes → merges into one concept
- **Critique:** Select 1 node → adds a warning node with 3 risks (markdown stripped)
- **Refine Title:** Select 1 node → concise title (≤ 8 words)

### Data Management
- **Save/Load:** Stored locally in SQLite
- **Import:** Upload exported JSON projects
- **Export:**
	- JSON: Full graph
	- Markdown: Hierarchical outline
	- CSV: Tabular data
	- PNG: High-resolution graph snapshot

## Technical Implementation

### AI Orchestration
- Agents: Creative (Inspire), Reasoning (Synthesize), Linguistic (Refine), Critical (Critique)
- Routing: Ollama (primary) → Gemini (backup) → OpenAI (tertiary)
- Domain adaptation: Prompts/personas swap per domain selection
- Logging: Backend logs which provider handled each call

### Visualization (vis-network)
- Hierarchical layout with generous spacing (`nodeSpacing: 450`, `levelSeparation: 250`)
- Modern palette: Emerald (user), Violet (inspire), Rose (critique), Blue (synthesis), Amber (refine), Slate (root)
- White text, shadows, rounded corners, navigation buttons, hover enabled

### Persistence
- Database: better-sqlite3 with WAL
- Session: localStorage keeps active project ID between reloads

## Quick Requirements Reference

- Node.js ≥ 18
- Ollama running with `mistral` pulled
- `.env` configured with at least `OLLAMA_URL` and `OLLAMA_MODEL`

## Notes

- Local-first: Works offline with Ollama
- Multi-system: Demonstrates task-based routing across providers
- User agency: Domain selector changes personas and tone
- Stable layout: Overlap minimized via spacing; no manual x-coordinates
