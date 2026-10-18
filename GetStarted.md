# Get started with Faro

Faro scans JavaScript and TypeScript repositories to produce Markdown documentation, Mermaid diagrams, an architecture report, and an optional semantic knowledge layer.

## Setup

1. Install Node.js 20 or newer and Docker.
2. Clone Faro, enter its directory, and install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in `GOOGLE_API_KEY` and `GROQ_API_KEY`:

   ```bash
   cp .env.example .env
   ```

   `GOOGLE_API_KEY` enables Gemini embeddings for search and chat. `GROQ_API_KEY` enables chat, agent tasks, and optional `--ai` summaries. Set `QDRANT_URL` only if Qdrant is not at `http://localhost:6333`.

4. Start Qdrant:

   ```bash
   docker compose up -d
   ```

5. Generate documentation and the knowledge layer:

   ```bash
   node src/index.js generate <projectPath>
   ```

   For Faro itself, use `node src/index.js generate ./`.

If `GOOGLE_API_KEY` or Qdrant is unavailable, Markdown, Mermaid graphs, and `ARCHITECTURE.md` still generate. Faro prints a yellow warning and skips the knowledge layer. Semantic search and chat need the knowledge layer; chat also needs `GROQ_API_KEY`. `--ai` summaries need `GROQ_API_KEY` but do not block the static docs when it is missing.

## Commands

```bash
node src/index.js generate <projectPath> [--ai]
node src/index.js reindex <projectPath> [--ai]
node src/index.js status
node src/index.js search "dependency graph" [-o outputDir] [-k topK]
node src/index.js chat "How is the dependency graph built?" [-o outputDir]
node src/index.js chat [-o outputDir]
node src/index.js agent <taskType> [targetFile] [-o outputDir]
```

`reindex` removes the project's existing Qdrant collection and rebuilds it. `status` shows the collection name, point count, and vector dimension. Interactive `chat` keeps recent user and assistant turns for the session.

## Generated artifacts

`output/` contains per-file and per-folder Markdown, `ARCHITECTURE.md`, `dependencies.mermaid`, and `classes.mermaid`. When the knowledge layer runs, it also contains `repository_index.json` and `qdrant_meta.json`; vectors and chunk payloads reside in Qdrant under `faro_vectors_<projectname>`.

## Stack

Faro uses Babel for `.js`, `.jsx`, `.ts`, and `.tsx` analysis, Gemini `gemini-embedding-001` via REST for 768-dimensional embeddings, Qdrant for vector storage, and Groq `openai/gpt-oss-20b` for language generation. Chat uses LangChain LCEL and a custom BaseRetriever for Faro's Qdrant payload.
