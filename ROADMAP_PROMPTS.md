# Faro — Phased Development Prompts

> **How to use this file:**
> Each section is a self-contained prompt you can paste directly to an AI assistant (Claude, GPT-4, etc.) to continue development on that phase. Each prompt includes full project context, exact tasks, file-level instructions, and a mandatory step to update `KNOWLEDGE.md` at the end.
>
> Before starting any phase, share two files with the AI: `KNOWLEDGE.md` (the living project knowledge base) and this file. After the phase is done, the AI updates `KNOWLEDGE.md` accordingly.

---

## Phase 1 — Real Embeddings + Qdrant Vector DB

### Context to paste before this prompt
> Share `KNOWLEDGE.md` first, then paste the prompt below.

---

```
You are continuing development on Faro, a Repository Intelligence Platform for JavaScript projects.

Read KNOWLEDGE.md carefully before writing any code. It contains the complete project architecture, all data models, the full pipeline, and the current tech stack. Do not deviate from the architecture rules documented there (ES Modules only, ProjectModel as source of truth, groqClient as shared factory, no CommonJS).

## Goal of this phase
Replace Faro's current hash-based embeddings and JSON vector store with:
1. Real neural embeddings via the Voyage AI API (model: voyage-code-3)
2. A Qdrant vector database (running locally via Docker) as the persistent vector store

This is the most critical upgrade to the project. The existing FNV-1a hash embedding (128-dim) is a TF-IDF approximation — it is not semantic. Replacing it with voyage-code-3 (1024-dim dense vectors trained on code) will make semantic search genuinely meaningful.

## Exact tasks

### Task 1 — Set up Voyage AI embeddings

File to replace: `src/knowledge/embeddingGenerator.js`

- Install the Voyage AI SDK: `npm install voyageai`
- Rewrite `embeddingGenerator.js` as an async module:
  - Export an async function `generateEmbedding(text: string): Promise<number[]>` that calls the Voyage AI API with model `voyage-code-3`
  - Export `VECTOR_DIMENSION = 1024` (voyage-code-3 output dimension)
  - Keep `calculateCosineSimilarity(vecA, vecB)` as a utility (it may still be needed for fallback)
  - Add a SHA-256 content hash cache (in-memory Map) so identical text is not re-embedded on the same run. Cache key = SHA-256 of the input string. Use Node's built-in `crypto.createHash('sha256')`.
  - The function must handle API errors gracefully: log a warning and return a zero vector of length VECTOR_DIMENSION on failure, so the pipeline does not crash if one chunk fails.
- Add `VOYAGE_API_KEY` to `.env.example`
- Update `src/core/groqClient.js` pattern as reference for how the Voyage client should be created (shared factory function, throws descriptive error if key missing)
- Create `src/core/voyageClient.js` following the same pattern as `groqClient.js`: a `createVoyageClient()` factory and a `getVoyageClient()` singleton getter

### Task 2 — Qdrant as vector store

File to replace: `src/knowledge/vectorStore.js`

- Install Qdrant JS client: `npm install @qdrant/js-client-rest`
- Rewrite `vectorStore.js` to be a Qdrant-backed class:
  - Collection name: `faro_vectors` (use the project name from ProjectModel if available)
  - Vector size: 1024 (matches voyage-code-3)
  - Distance: Cosine
  - The class must implement the same public interface as the old VectorStore so the rest of the codebase does not need to change:
    - `async add(chunk, vector)` → upsert a point to Qdrant with point ID = integer index, vector = the float array, payload = the full chunk object
    - `async search(queryVector, topK, minScore)` → use Qdrant's `search()` with `score_threshold: minScore`, return `[{ score, chunk }]` matching existing shape
    - `async save(outputDir)` → Qdrant is persistent, so this method writes a small metadata JSON to `outputDir/qdrant_meta.json` with collection name, total points, and timestamp (for reference/debugging)
    - `async load(outputDir)` → reads `qdrant_meta.json` and verifies the collection exists in Qdrant; returns true/false
  - Qdrant connection: `http://localhost:6333` default, configurable via `QDRANT_URL` env var
  - On `add()`, create the collection if it does not exist (idempotent upsert)
  - On `search()`, include a `filter` parameter (optional) so callers can filter by `chunk.type` or `chunk.filePath` prefix in future phases

### Task 3 — Make the embedding pipeline async end-to-end

File to update: `src/knowledge/searchEngine.js`

- `buildAndSaveVectorStore()` already loops over chunks calling `generateEmbedding()`. Since this is now async (API calls), add proper `await` and batch the API calls in groups of 20 with a small delay (50ms) between batches to avoid rate limiting.
- `searchRepository()` is already async — add `await` to `generateEmbedding(query)`.
- Print a progress indicator using `ora` showing "Embedding chunk X/total" during indexing.

### Task 4 — Update CLI to expose Qdrant collection management

File to update: `src/cli/index.js`

- Add a new CLI command: `faro reindex <projectPath>` that forces a full re-embedding and re-upsert into Qdrant even if the collection already exists. This is the "rebuild from scratch" command.
- Add a new CLI command: `faro status` that connects to Qdrant and prints the collection name, number of points, and vector dimension.

### Task 5 — Docker setup

- Create a `docker-compose.yml` in the project root:
  ```yaml
  services:
    qdrant:
      image: qdrant/qdrant:latest
      ports:
        - "6333:6333"
        - "6334:6334"
      volumes:
        - ./qdrant_storage:/qdrant/storage
  ```
- Add `qdrant_storage/` to `.gitignore`
- Update `README.md` or `GetStarted.md` with setup instructions: "Run `docker compose up -d` before using Faro"

### Task 6 — Update KNOWLEDGE.md

After all code is written and tested, update `KNOWLEDGE.md`:
- Section 6 (Tech Stack): replace the embedding and vector store rows with Voyage AI and Qdrant entries, add VOYAGE_API_KEY and QDRANT_URL env vars to Section 6
- Section 7 (Known Limitations): mark limitations 1 and 2 as resolved
- Section 9 (Development Status): mark Phase 1 as ✅ Complete
- Section 10 (Update Log): add an entry with today's date, phase name, and summary of changes

## Constraints
- Do not change any analyzer, parser, model, or generator files
- Do not introduce CommonJS — all files must use ES Module syntax
- Keep the existing public interface of VectorStore so chatEngine.js and searchEngine.js callers need minimal changes
- Do not change the chunk data structure — chunks must remain identical
- All new env vars must be added to .env.example with comments
- Use JSDoc on all exported functions

## Success criteria
- `npx faro generate ./src` completes without error (requires both GROQ_API_KEY and VOYAGE_API_KEY and Qdrant running)
- `npx faro search "dependency graph"` returns results that are semantically related (not just lexically matching)
- `npx faro status` prints Qdrant collection info
- Searching for "authentication" returns auth-related chunks even if the word "authentication" does not appear literally in the code
```

---

## Phase 2 — LangChain RAG Pipeline

### Context to paste before this prompt
> Share the updated `KNOWLEDGE.md` (after Phase 1) first, then paste the prompt below.

---

```
You are continuing development on Faro, a Repository Intelligence Platform for JavaScript projects.

Read KNOWLEDGE.md carefully before writing any code. Phase 1 is complete: Faro now uses Voyage AI neural embeddings (voyage-code-3, 1024-dim) and Qdrant as the vector database.

## Goal of this phase
Port the hand-rolled RAG pipeline in `chatEngine.js` to a proper LangChain LCEL (LangChain Expression Language) chain. The agent in `agentEngine.js` stays unchanged in this phase. The goal is to make the RAG pipeline composable, evaluatable, and swappable.

## Exact tasks

### Task 1 — Install LangChain

```bash
npm install langchain @langchain/groq @langchain/community
```

The `@langchain/community` package provides the Qdrant vector store integration.

### Task 2 — Create a LangChain Qdrant retriever

Create new file: `src/knowledge/langchainRetriever.js`

- Export a function `buildFaroRetriever(options)` that:
  - Instantiates a `QdrantVectorStore` from `@langchain/community/vectorstores/qdrant` pointed at the `faro_vectors` collection
  - Uses a custom `EmbeddingsAdapter` class that wraps Faro's async `generateEmbedding()` function to implement LangChain's `Embeddings` interface (the interface requires `embedDocuments(texts)` and `embedQuery(text)`)
  - Returns the vector store as a retriever: `vectorStore.asRetriever({ k: options.topK ?? 5 })`
- Also export a `buildFaroRetrieverWithFilter(filter)` variant that adds a Qdrant payload filter (e.g., filter by chunk type or file path prefix)

### Task 3 — Build the LCEL RAG chain

Create new file: `src/chat/ragChain.js`

- Export an async function `buildRAGChain(outputDir)` that creates and returns a runnable LCEL chain:
  1. Input: `{ question: string }`
  2. Retriever step: fetch top-5 chunks from Qdrant
  3. Context formatting step: format retrieved `Document` objects into the same structure as the existing `buildRAGPrompt()` — file path, line range, content
  4. Architecture context step: if the question contains architecture keywords (reuse `isArchitectureQuery()` logic from `chatEngine.js`), append `ARCHITECTURE.md` content
  5. Data flow step: extract matching dependency edges from `dependencies.mermaid` for retrieved files
  6. Prompt step: `ChatPromptTemplate.fromMessages([systemMessage, humanMessage])` — system message = "You are Faro AI..." (reuse existing system prompt text), human message = formatted context + question
  7. LLM step: `new ChatGroq({ model: "llama-3.1-8b-instant", temperature: 0.2, maxTokens: 1024 })`
  8. Output parser: `StringOutputParser`
- The chain must stream: the final LLM step should support `.stream()` so the CLI can print tokens as they arrive
- Export `streamRAGAnswer(question, outputDir)` as the main entry point — this calls `chain.stream({ question })` and yields chunks

### Task 4 — Update chatEngine.js to use the LCEL chain

File to update: `src/chat/chatEngine.js`

- Replace the `askRepository()` function body to call `streamRAGAnswer()` from `ragChain.js` and print streamed tokens to console
- Replace the `startInteractiveChat()` REPL loop's LLM call to use `streamRAGAnswer()` — keep the readline REPL, conversation history management, and all formatting; only replace the retrieval + LLM section
- Keep `buildRAGPrompt()` exported (it is tested and used in the old agent — do not delete it until Phase 3)
- Keep `isArchitectureQuery()` and `getDataFlowContext()` — they are reused by `ragChain.js`

### Task 5 — Add LangSmith tracing (optional but strongly recommended)

- Add to `.env.example`:
  ```
  LANGCHAIN_TRACING_V2=true
  LANGCHAIN_API_KEY=ls__your_key_here
  LANGCHAIN_PROJECT=faro
  ```
- These env vars are picked up automatically by LangChain — no code changes needed
- Add a comment in `ragChain.js` explaining how to enable tracing and a link to https://smith.langchain.com

### Task 6 — Update KNOWLEDGE.md

After all code is written and tested, update `KNOWLEDGE.md`:
- Section 2 (Repository Structure): add `src/knowledge/langchainRetriever.js` and `src/chat/ragChain.js`
- Section 3 (Pipeline): update the Chat Engine section to describe the LCEL chain steps
- Section 6 (Tech Stack): add LangChain, @langchain/groq, @langchain/community
- Section 7 (Known Limitations): mark limitation 3 (no LangChain) as resolved
- Section 9 (Development Status): mark Phase 2 as ✅ Complete
- Section 10 (Update Log): add entry

## Constraints
- Do not change the agent (agentEngine.js) — that is Phase 3
- Do not change analyzers, parser, model, or scanner files
- The existing CLI commands must still work identically — only the internals of chat change
- Keep streaming: the REPL must print tokens as they arrive, not wait for the full response
- ES Modules only throughout

## Success criteria
- `npx faro chat "how does the dependency graph work?"` streams a response token by token
- `npx faro chat` (interactive REPL) works as before with streaming output
- LangSmith dashboard (if keys provided) shows traces with retriever → prompt → LLM steps
- The chain is swappable: changing the LLM from ChatGroq to ChatAnthropic requires only changing one line in ragChain.js
```

---

## Phase 3 — LangGraph Agentic Workflow

### Context to paste before this prompt
> Share the updated `KNOWLEDGE.md` (after Phase 2) first, then paste the prompt below.

---

```
You are continuing development on Faro, a Repository Intelligence Platform for JavaScript projects.

Read KNOWLEDGE.md carefully before writing any code. Phases 1 and 2 are complete: Faro uses Voyage AI embeddings, Qdrant vector DB, and a LangChain LCEL RAG chain for chat.

## Goal of this phase
Replace the switch-statement agent in `agentEngine.js` with a proper LangGraph stateful workflow. The agent must be able to decide to retrieve more context before generating, use tools, and loop — not just execute a single prompt per task.

## Exact tasks

### Task 1 — Install LangGraph

```bash
npm install @langchain/langgraph
```

### Task 2 — Define the agent state schema

Create new file: `src/agent/agentState.js`

Define the graph state using LangGraph's `Annotation` API:
```js
import { Annotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
  taskType: Annotation({ reducer: (_, b) => b }),
  targetFile: Annotation({ reducer: (_, b) => b }),
  outputDir: Annotation({ reducer: (_, b) => b }),
  retrievedChunks: Annotation({ reducer: (_, b) => b, default: () => [] }),
  architectureContext: Annotation({ reducer: (_, b) => b, default: () => "" }),
  dependencyContext: Annotation({ reducer: (_, b) => b, default: () => "" }),
  fileContent: Annotation({ reducer: (_, b) => b, default: () => "" }),
  needsMoreContext: Annotation({ reducer: (_, b) => b, default: () => false }),
  refinedQuery: Annotation({ reducer: (_, b) => b, default: () => "" }),
  iterationCount: Annotation({ reducer: (a, _) => a + 1, default: () => 0 }),
  output: Annotation({ reducer: (_, b) => b, default: () => "" }),
  messages: Annotation({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});
```

### Task 3 — Define agent tools

Create new file: `src/agent/agentTools.js`

Define LangChain tools the agent can call. Use `tool()` from `@langchain/core/tools`:

1. `searchCodebaseTool` — wraps `searchRepository(query, outputDir, topK)` from the knowledge layer. Schema: `{ query: string, topK?: number }`. Returns formatted chunk results as a string.
2. `getFileContentTool` — reads a file from disk given its path relative to project root. Schema: `{ filePath: string }`. Returns the file source code wrapped in a markdown code block. Includes error handling for missing files.
3. `getArchitectureReportTool` — reads `ARCHITECTURE.md` from the output directory. No input schema. Returns the full markdown content.
4. `getDependencyGraphTool` — reads `dependencies.mermaid` from the output directory. No input schema. Returns the mermaid graph as a string.
5. `getMetricsTool` — reads `repository_index.json` and returns a count summary: total chunks by type, total files, etc.

### Task 4 — Build the LangGraph agent graph

Create new file: `src/agent/agentGraph.js`

Build a `StateGraph` with these nodes:

**Nodes:**
- `retrieve_context` — based on `state.taskType` and `state.targetFile`, decide which tools to call and populate `retrievedChunks`, `architectureContext`, `dependencyContext`, `fileContent`. For file-scoped tasks (refactor, test, impact) always retrieve file content. For project-scoped tasks (review, readme, quality) always retrieve architecture context.
- `evaluate_sufficiency` — call the LLM with the retrieved context and ask: "Given this context and the task '{taskType}', do you have enough information to complete the task? Answer JSON: { sufficient: boolean, refinedQuery: string }". Parse the JSON response. Set `state.needsMoreContext` and `state.refinedQuery`.
- `retrieve_more` — use `state.refinedQuery` to call `searchCodebaseTool` and append results to `state.retrievedChunks`. Increment `iterationCount`.
- `generate_output` — call the LLM with the full context and task-specific prompt (migrate the existing switch-case prompts from `agentEngine.js` into this node). Stream the output. Set `state.output`.

**Edges:**
- `START` → `retrieve_context`
- `retrieve_context` → `evaluate_sufficiency`
- `evaluate_sufficiency` → conditional:
  - if `needsMoreContext && iterationCount < 2` → `retrieve_more`
  - else → `generate_output`
- `retrieve_more` → `evaluate_sufficiency`
- `generate_output` → `END`

**Session persistence:**
- Use LangGraph's `MemorySaver` checkpointer for in-memory session state
- Each `executeAgentTask()` call should use a unique `thread_id` (generate with `crypto.randomUUID()`) so concurrent tasks don't share state

### Task 5 — Update agentEngine.js

File to update: `src/agent/agentEngine.js`

- Replace the entire implementation with a thin wrapper that:
  1. Creates the graph from `agentGraph.js`
  2. Calls `graph.invoke({ taskType, targetFile, outputDir }, { configurable: { thread_id: crypto.randomUUID() } })`
  3. Prints `state.output` to console with existing formatting
- Keep the same exported function signature: `executeAgentTask(taskType, targetFile, outputDir)` — the CLI must not change

### Task 6 — Update KNOWLEDGE.md

After all code is written and tested, update `KNOWLEDGE.md`:
- Section 2: add `src/agent/agentState.js`, `src/agent/agentTools.js`, `src/agent/agentGraph.js`
- Section 3: update Agent Engine section to describe the LangGraph nodes and edges
- Section 6: add @langchain/langgraph
- Section 7: mark limitation 3 fully resolved (agent now uses LangGraph)
- Section 9: mark Phase 3 as ✅ Complete
- Section 10: add entry

## Constraints
- The CLI command `npx faro agent <taskType> [targetFile]` must work identically — only internals change
- Do not change chat, scanner, parser, model, or analyzer files
- The graph must handle API errors in each node gracefully without crashing
- Maximum 2 retrieval iterations to prevent infinite loops
- ES Modules only

## Success criteria
- `npx faro agent refactor src/knowledge/embeddingGenerator.js` produces a detailed refactoring plan
- LangSmith traces (if enabled) show the graph nodes: retrieve_context → evaluate_sufficiency → (optionally retrieve_more) → generate_output
- The agent can answer "Did you have enough context?" — visible in the evaluate_sufficiency node decision
```

---

## Phase 4 — MCP Server

### Context to paste before this prompt
> Share the updated `KNOWLEDGE.md` (after Phase 3) first, then paste the prompt below.

---

```
You are continuing development on Faro, a Repository Intelligence Platform for JavaScript projects.

Read KNOWLEDGE.md carefully before writing any code. Phases 1–3 are complete.

## Goal of this phase
Build a Model Context Protocol (MCP) server that exposes Faro's core capabilities as MCP tools. This allows Claude Desktop (and any other MCP-compatible AI client) to use Faro directly: analyzing a repository, searching the codebase, asking questions, and running agent tasks — all from within a conversation.

## Exact tasks

### Task 1 — Install MCP SDK

```bash
npm install @modelcontextprotocol/sdk
```

### Task 2 — Create the MCP server

Create new file: `src/mcp/faroMcpServer.js`

Use the `@modelcontextprotocol/sdk` Server class with `StdioServerTransport`. Define these MCP tools:

**Tool 1: `analyze_repository`**
- Description: "Scan a local JavaScript repository, generate documentation, build dependency graphs, and index the codebase into the Faro knowledge store. Must be run before using search or chat tools."
- Input schema: `{ projectPath: string, withAI?: boolean }`
- Handler: call `loadProject(projectPath)` then `generateDocumentation(project, "output", { ai: withAI })`
- Return: JSON summary with file count, chunk count, collection name

**Tool 2: `semantic_search`**
- Description: "Search the indexed repository knowledge store using semantic similarity. Returns relevant code chunks with file paths and line numbers."
- Input schema: `{ query: string, topK?: number, filterType?: "file"|"function"|"class"|"route"|"component" }`
- Handler: call `searchRepository(query, "output", topK)`, apply type filter if provided
- Return: formatted array of results with score, filePath, lineRange, content preview

**Tool 3: `ask_repository`**
- Description: "Ask a natural language question about the indexed codebase. Returns an AI-generated answer grounded in the retrieved code context."
- Input schema: `{ question: string }`
- Handler: call `askRepository(question, "output")` from `chatEngine.js`
- Return: the LLM answer string

**Tool 4: `run_agent_task`**
- Description: "Run an engineering agent task against the indexed repository. Tasks: refactor, test, readme, review, impact, quality."
- Input schema: `{ taskType: "refactor"|"test"|"readme"|"review"|"impact"|"quality", targetFile?: string }`
- Handler: call `executeAgentTask(taskType, targetFile, "output")`
- Return: the agent output string

**Tool 5: `get_architecture_report`**
- Description: "Return the full ARCHITECTURE.md report for the indexed repository, including metrics, fan-in/out, circular dependencies, and dead files."
- Input schema: `{}` (no inputs)
- Handler: read `output/ARCHITECTURE.md` and return its contents
- Return: markdown string

**Tool 6: `get_dependency_graph`**
- Description: "Return the Mermaid dependency graph for the indexed repository."
- Input schema: `{ format?: "mermaid"|"summary" }`
- Handler: read `output/dependencies.mermaid`; if format is "summary", return edge count and node count only
- Return: mermaid string or summary object

### Task 3 — Create the MCP server entry point

Create new file: `src/mcp/index.js`

```js
#!/usr/bin/env node
import { startFaroMcpServer } from "./faroMcpServer.js";
startFaroMcpServer();
```

### Task 4 — Register in package.json

Add to the `"bin"` field in `package.json`:
```json
"faro-mcp": "./src/mcp/index.js"
```

### Task 5 — Claude Desktop configuration

Create new file: `mcp-config.example.json` in the project root:
```json
{
  "mcpServers": {
    "faro": {
      "command": "node",
      "args": ["/absolute/path/to/Faro/src/mcp/index.js"],
      "env": {
        "GROQ_API_KEY": "your_key_here",
        "VOYAGE_API_KEY": "your_key_here",
        "QDRANT_URL": "http://localhost:6333"
      }
    }
  }
}
```

Add instructions to `GetStarted.md` explaining how to add this to Claude Desktop's config file at `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

### Task 6 — Update KNOWLEDGE.md

- Section 2: add `src/mcp/faroMcpServer.js`, `src/mcp/index.js`
- Section 5 (CLI Commands): add a note about running as MCP server
- Section 6 (Tech Stack): add @modelcontextprotocol/sdk
- Section 9: mark Phase 4 as ✅ Complete
- Section 10: add entry

## Constraints
- MCP tools must never print to stdout (that breaks the stdio transport). Use `console.error()` for all logging inside the MCP server.
- All tools must return structured responses — never throw unhandled errors to the MCP client; catch all errors and return `{ error: string }` in the content field
- ES Modules only
- Do not change CLI, chat, agent, or knowledge files — MCP layer is additive only

## Success criteria
- `node src/mcp/index.js` starts without error
- Adding the server to Claude Desktop and asking "analyze my repo at /path/to/project" triggers the `analyze_repository` tool and returns a summary
- A demo: in Claude Desktop, ask "what does the dependency graph look like?" → Claude calls `get_dependency_graph` → displays the Mermaid graph
```

---

## Phase 5 — Web API + Frontend

### Context to paste before this prompt
> Share the updated `KNOWLEDGE.md` (after Phase 4) first, then paste the prompt below.

---

```
You are continuing development on Faro, a Repository Intelligence Platform for JavaScript projects.

Read KNOWLEDGE.md carefully before writing any code. Phases 1–4 are complete.

## Goal of this phase
Build a REST API server (Fastify) and a minimal React frontend so Faro can be used by anyone via a browser — not just by developers via CLI.

## Exact tasks

### Task 1 — Install server dependencies

```bash
npm install fastify @fastify/cors @fastify/static
```

### Task 2 — Create the Fastify API server

Create new file: `src/server/server.js`

Define these routes:

**POST `/api/analyze`**
- Body: `{ projectPath: string, withAI?: boolean }`
- Handler: `loadProject()` + `generateDocumentation()` — stream progress via SSE or return JSON summary on completion
- Response: `{ success: boolean, fileCount: number, chunkCount: number, projectName: string }`

**POST `/api/search`**
- Body: `{ query: string, topK?: number }`
- Response: array of `{ score, filePath, type, name, lineRange, contentPreview }`

**POST `/api/chat`** (streaming)
- Body: `{ question: string }`
- Response: `text/event-stream` — stream LLM tokens using SSE. Each event: `data: <token>\n\n`. Final event: `data: [DONE]\n\n`

**GET `/api/architecture`**
- Response: `{ markdown: string }` — contents of `output/ARCHITECTURE.md`

**GET `/api/graph`**
- Response: `{ mermaid: string }` — contents of `output/dependencies.mermaid`

**POST `/api/agent`**
- Body: `{ taskType: string, targetFile?: string }`
- Response: `{ output: string }`

### Task 3 — Create the CLI server command

File to update: `src/cli/index.js`

Add command: `faro serve [--port 3000]` that calls `startServer(port)` from `src/server/server.js`.

### Task 4 — Build the React frontend

Create directory: `client/`

Build a minimal single-page React app (Vite) with three panels:

1. **Analyse panel** — text input for project path, Analyse button, shows progress. On completion shows file count and project name.

2. **Graph panel** — renders the Mermaid dependency graph using `mermaid.js`. Nodes are clickable: clicking a node shows a side panel with that file's functions, classes, and routes.

3. **Chat panel** — text input, submit button, displays streamed LLM responses word by word using the SSE `/api/chat` endpoint.

Keep the frontend simple: no authentication, no routing library, Tailwind CSS for styling, three tab panels. This is a portfolio demo, not a production app.

### Task 5 — Update KNOWLEDGE.md

- Section 2: add `src/server/server.js`, `client/`
- Section 5: add `faro serve` command
- Section 6: add Fastify, React, Vite, Tailwind
- Section 9: mark Phase 5 as ✅ Complete
- Section 10: add entry

## Constraints
- API and frontend are additive — do not change CLI, MCP, agent, or knowledge files
- SSE streaming for `/api/chat` is mandatory — no buffered responses for chat
- Frontend build output goes to `client/dist/` which Fastify serves as static files
- ES Modules only for server code; Vite handles frontend bundling separately

## Success criteria
- `npx faro serve` starts at localhost:3000
- Visiting localhost:3000 shows the app
- Entering a project path and clicking Analyse completes without error
- The Mermaid graph renders interactively
- Asking a question in the chat panel streams the response token by token
```

---

## Appendix: KNOWLEDGE.md Update Instructions (for every phase)

> Paste this at the end of every phase prompt if you want to be explicit:

```
## Required final step — KNOWLEDGE.md update

Before finishing this session, you MUST update KNOWLEDGE.md with everything that changed in this phase:

1. Section 2 (Repository Structure): add new files with one-line descriptions
2. Section 3 (Full Pipeline): update any changed pipeline steps
3. Section 6 (Tech Stack): add new packages with version and purpose
4. Section 7 (Known Limitations): mark resolved limitations as resolved, add any new ones discovered
5. Section 9 (Development Status): mark the completed phase as ✅ Complete
6. Section 10 (Update Log): add a row with today's date, phase name, and a 1–2 sentence summary

Return the complete updated KNOWLEDGE.md content so I can commit it to the repository.
```

