# IdeaForge

An AI-powered creative support tool featuring a **multi-expert system** with domain-specific personas for ideation, synthesis, and critical analysis. Built as a GenAI course project demonstrating multi-agent orchestration and local AI deployment.

## 🎯 Key Features

### Multi-Expert System
Switch between specialized AI personas via dropdown selector:
- **⚡ General Ideation** - Broad creative exploration
- **📖 Short Story/Narrative** - Plot consultant, master editor, literary critic
- **🚀 Business & Innovation** - Disruptive innovator, product manager, venture capitalist

### Four AI Agents
Each domain uses specialized prompts across four creative functions:
- **Creative Agent (Inspire)** - Generates 3 divergent ideas with domain-specific constraints
- **Reasoning Agent (Synthesize)** - Merges 2-3 concepts using domain logic (e.g., story synopsis vs. UVP)
- **Linguistic Agent (Refine Title)** - Generates concise 8-word titles
- **Critical Agent (Critique)** - Identifies 3 flaws/risks through domain-specific lens

### Interactive Graph Interface
- **vis-network** hierarchical visualization with color-coded branches
- Multi-select nodes, drag-and-drop positioning
- Automatic spacing for inspired ideas (prevents overlap)
- Color coding: blue (original), green (user), red (critique), purple (synthesis), orange (refined)

### Project Management
- SQLite persistence with save/load/delete
- Multi-format export: JSON, Markdown, CSV, **PNG image**
- JSON import with validation
- Auto-save on AI operations

## 🛠️ Technical Stack

- **Backend**: Node.js/Express, better-sqlite3, winston logging
- **Frontend**: vis-network 9.1.0, vanilla JavaScript
- **AI Providers**: 
  - **Primary**: Ollama/Mistral (local inference, no API limits)
  - **Backup**: Gemini 2.0 Flash (cloud fallback)
  - **Tertiary**: OpenAI GPT-3.5 (last resort)
- **Rate Limiting**: 10 AI requests/minute per IP

## 📋 Requirements

- **Node.js 18+**
- **Ollama** installed and running locally ([ollama.ai](https://ollama.ai))
- **Mistral model** pulled: `ollama pull mistral`
- (Optional) Gemini API key for cloud backup

## 🚀 Setup

### 1. Install Ollama and Pull Mistral Model

```bash
# macOS
brew install ollama
ollama pull mistral

# Verify Ollama is running
curl http://localhost:11434/api/tags
```

### 2. Install Dependencies

```bash
cd /Users/jonassaathoff/Desktop/GENAI-PROJECT
npm install
```

### 3. Configure Environment

Create a `.env` file:

```bash
cat > .env <<ENVEOF
# Ollama (Primary - Local Inference)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral

# Gemini (Backup - Cloud Fallback)
GEMINI_API_KEY=your_gemini_key_here_optional

# Optional: OpenAI (Tertiary Fallback)
# OPENAI_API_KEY=your_openai_key_here
ENVEOF
```

### 4. Run the Server

```bash
npm start
```

### 5. Open in Browser

http://localhost:3000

## 📖 Usage Guide

1. **Select Domain**: Choose expertise mode (General/Story/Business) from dropdown
2. **Create Root Idea**: Type initial concept and click "New Idea"
3. **Inspire**: Select 1 node → Click "Inspire" → Get 3 divergent variations
4. **Synthesize**: Select 2-3 nodes → Click "Synthesize" → Merge into cohesive concept
5. **Critique**: Select 1 node → Click "Critique" → Identify 3 potential flaws
6. **Refine Title**: Select 1 node → Click "Refine Title" → Auto-generate concise title
7. **Export**: Download as JSON/Markdown/CSV/PNG for presentations

## 🎨 Domain-Specific Examples

### Story Domain
- **Inspire**: "A detective discovers their partner is the killer" → Gets plot twists with narrative tension
- **Synthesize**: Merges character arcs into cohesive story synopsis
- **Critique**: Identifies plot holes, character motivation gaps, pacing issues

### Business Domain
- **Inspire**: "AI for education" → Gets market gap analysis, monetization models
- **Synthesize**: Combines features into UVP/elevator pitch
- **Critique**: Identifies competitive risks, monetization challenges, market viability

## 🏗️ Architecture

### Multi-Agent Orchestration
Server logs routing decisions for transparency:
```
Orchestrator: Routing "inspire" to Ollama (Creative Agent)
Orchestrator: Routing "synthesize" to Ollama (Reasoning Agent)
Orchestrator: Routing "critique" to Ollama (Critical Agent)
```

### Fallback Chain
```
Ollama (local) → Gemini (cloud) → OpenAI (tertiary)
```

If Ollama unavailable, automatically routes to Gemini backup. If Gemini quota exhausted, falls back to OpenAI.

## 📊 API Endpoints

- `POST /api/inspire` - Generate 3 divergent ideas (accepts `domain` param)
- `POST /api/synthesize` - Merge 2-3 concepts (accepts `domain` param)
- `POST /api/critique` - Identify 3 flaws/risks (accepts `domain` param)
- `POST /api/refine-title` - Generate 8-word title
- `POST /api/projects` - Save project
- `GET /api/projects` - List all projects
- `GET /api/projects/:id` - Load project
- `DELETE /api/projects/:id` - Delete project
- `GET /api/export/:id/:format` - Export as JSON/Markdown/CSV

## 🔒 Security & Rate Limiting

- 10 AI requests per minute per IP
- 100 general requests per 15 minutes per IP
- Input validation and sanitization
- SQLite WAL mode for safe concurrent access

## 📝 Notes

- **Local-first design**: Ollama ensures no external API dependencies or rate limits
- **Multi-expert personas**: Transform the tool from ChatGPT wrapper to domain-aware creative partner
- **Orchestration logging**: Demonstrates multi-system coordination for academic submission
- **Export capabilities**: PNG download provides "wow factor" for presentations

## 🎓 Academic Context

This project demonstrates:
1. **Multi-system orchestration** - Task-based routing across specialized AI agents
2. **Domain expertise** - Curated personas (e.g., Venture Capitalist vs. Literary Critic)
3. **User agency** - Domain selector gives users control over creative constraints
4. **Local deployment** - Ollama enables submission as standalone zip without cloud dependencies
