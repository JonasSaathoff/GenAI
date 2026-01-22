# IdeaForge – Multi-Expert Creative Graph

Project for Generative AI @ Leiden University in 2026. It demonstrates spatial AI-assisted ideation using a graph-based interface with specialized AI agents for brainstorming, synthesis, and critical evaluation.

📄 Read the full report here: [IdeaForge Research Paper (PDF)](https://github.com/JonasSaathoff/GenAI/blob/main/report.pdf)

## Overview

This project implements a creative support tool that can:
- Generate divergent ideas from any concept (Inspire agent)
- Merge multiple concepts into cohesive syntheses (Synthesize agent)
- Provide critical evaluation and identify flaws (Critique agent)
- Support custom AI personas and domain-specific workflows
- Visualize idea relationships as an interactive node graph
- Operate with hybrid AI (Cloud + Local fallback for reliability)

## Project Structure

```
├── server.js               # Express backend with multi-agent orchestration
├── public/
│   ├── index.html          # Graph UI with domain selector and custom roles
│   ├── app.js              # Frontend logic, vis-network graph, CRUD operations
│   └── styles.css          # UI styling
├── package.json            # Dependencies and scripts
├── .env                    # API keys (user-created, not in repo)
└── README.md               # This file
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Install Ollama (for local AI fallback):
```bash
ollama pull mistral
```

3. Create a `.env` file in the root directory:
```bash
# Primary Cloud Model (Recommended)
GEMINI_API_KEY=your_gemini_api_key_here

# Local Fallback Model
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral
```

## Usage

### Start the Application

Run the server:

```bash
npm start
```

Open `http://localhost:3000` in your browser.

### Graph Operations

- **Selection**: Click a node to select; Shift/Cmd/Ctrl+Click to multi-select
- **Inspire**: Select 1 node → Generate 3 divergent alternatives
- **Synthesize**: Select 2+ nodes → Merge into a unified concept
- **Critique**: Select 1 node → Identify 3 potential flaws or risks
- **Refine**: Condense long-form text into concise titles
- **New Idea**: Add manual ideas as child nodes
- **Save/Load**: Persist projects locally via JSON

### Custom Personas

Use the "Custom Role" input to dynamically override preset domains:
- Example: `"Skeptical VC"`, `"Sci-Fi Author"`, `"UX Researcher"`
- The AI will adopt this perspective for all subsequent operations

### Exporting

Export your idea graph as:
- **JSON**: Full project data with graph structure
- **Markdown**: Hierarchical text outline
- **CSV**: Tabular format for spreadsheets
- **PNG**: Visual snapshot of the graph

## Architecture Notes

The system uses a **Smart Hybrid AI** approach:
- **Primary**: Gemini 2.0 Flash (fast, high-quality cloud reasoning)
- **Fallback**: Ollama/Mistral (local, privacy-preserving, no quota limits)

If Gemini quota is exhausted, the backend automatically switches to Ollama to ensure uninterrupted workflows.
