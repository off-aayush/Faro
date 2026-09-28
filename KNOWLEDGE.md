# Faro — Project Knowledge Base

> **This is a living document.** Every time a development phase completes, update the relevant sections to reflect the new state of the project. The AI assistant working on each phase is responsible for updating this file before closing the session.

---

## 1. Project Vision

Faro is a **Repository Intelligence Platform** for JavaScript/TypeScript projects. It is not a Markdown documentation generator — it is a system that understands a codebase through static analysis, builds a semantic knowledge model, generates documentation and architecture visualisations, and powers an AI assistant capable of answering questions about the repository.

**The core principle:** `ProjectModel` is the single source of truth. Every feature — documentation, graphs, metrics, embeddings, chat — is derived from it.

---

## 2. Repository Structure

```
Faro/
├── src/
│   ├── cli/
│   │   └── index.js              # Commander.js CLI — entry point for all commands
│   ├── core/
│   │   ├── AnalyzerEngine.js     # Runs all analyzers sequentially on a FileModel
│   │   ├── DependencyGraph.js    # Builds a directed graphlib graph from imports
│   │   ├── DocumentationEngine.js # Orchestrates the full generation pipeline
│   │   ├── ProjectLoader.js      # Scans → parses → analyzes → builds ProjectModel
│   │   └── groqClient.js         # Shared Groq SDK factory (model: openai/gpt-oss-20b)
│   ├── model/
│   │   ├── FileModel.js          # Per-file data container (path, AST, imports, exports, functions, classes, routes, components)
│   │   └── ProjectModel.js       # Top-level container: projectName + array of FileModels
│   ├── scanner/
│   │   └── scanProject.js        # glob("**/*.js") with standard ignore list → sorted file paths
│   ├── parser/
│   │   └── parser.js             # Babel parser with JSX, classProperties, dynamicImport, optionalChaining
│   ├── analyzers/
│   │   ├── importAnalyzer.js     # Populates fileModel.imports (source, type: local|external, specifiers)
│   │   ├── exportAnalyzer.js     # Populates fileModel.exports (name, type, source)
│   │   ├── functionAnalyzer.js   # Populates fileModel.functions (name, async, params, loc, type)
│   │   ├── classAnalyzer.js      # Populates fileModel.classes (name, superClass, properties, methods, loc)
│   │   ├── routeAnalyzer.js      # Populates fileModel.routes (method, path, handler, middleware, loc)
│   │   ├── reactAnalyzer.js      # Populates fileModel.components (name, props, hooks, jsxChildren, loc)
│   │   └── metricsAnalyzer.js    # Computes fan-in, fan-out, LOC, complexity, circular deps, dead files
│   ├── generators/
│   │   ├── markdownGenerator.js          # Writes output/<filepath>.md for every file
│   │   ├── mermaidGenerator.js           # Writes output/dependencies.mermaid + output/classes.mermaid
│   │   ├── aiGenerator.js                # Groq-powered AI narrative summaries (--ai flag)
│   │   ├── architectureReportGenerator.js # Writes output/ARCHITECTURE.md with metrics
│   │   └── folderSummaryGenerator.js     # Writes per-folder README summaries
│   ├── knowledge/
│   │   ├── chunker.js            # Slices FileModels into typed semantic chunks (file/class/function/route/component)
│   │   ├── indexer.js            # Iterates all files → chunkFile() → flat array → saves repository_index.json
│   │   ├── embeddingGenerator.js # ⚠ CURRENT: FNV-1a hash bag (128-dim TF-IDF approximation), NOT neural
│   │   ├── vectorStore.js        # ⚠ CURRENT: In-memory array serialised to vector_store.json (brute-force cosine scan)
│   │   └── searchEngine.js       # buildAndSaveVectorStore() + searchRepository() + displaySearchResults()
│   ├── chat/
│   │   └── chatEngine.js         # RAG pipeline: search → augment prompt → Groq → stream reply; REPL loop with conversation history
│   └── agent/
│       └── agentEngine.js        # Engineering agent: refactor / test / readme / review / impact / quality tasks
├── output/                        # Generated artefacts (git-ignored or committed per preference)
│   ├── vector_store.json          # ⚠ CURRENT: Entire vector store serialised as flat JSON
│   ├── repository_index.json      # All semantic chunks (no vectors)
│   ├── ARCHITECTURE.md            # Metrics report with fan-in/out, complexity, dead files
│   ├── dependencies.mermaid       # Full project dependency flowchart
│   └── classes.mermaid            # UML class diagram
├── .env                           # GROQ_API_KEY (gitignored)
├── .env.example                   # Template for required env vars
├── package.json                   # name: faro, type: module, node >=20
└── DEVELOPMENT_PLANS.md           # Original phased roadmap (now superseded by this file + ROADMAP_PROMPTS.md)
```

---

## 3. Full Pipeline — Step by Step

```
CLI command
    │
    ▼
ProjectLoader.loadProject(projectPath)
    │
    ├── scanProject()           → glob("**/*.js"), ignores node_modules/.git/dist/build/coverage
    │
    ├── for each file:
    │       fs.readFile()       → sourceCode: string
    │       parseFile()         → AST (Babel, sourceType: "unambiguous")
    │       new FileModel()     → { path, sourceCode, ast, imports:[], exports:[], functions:[], classes:[], routes:[], components:[] }
    │       analyze(fileModel)  → runs all 6 analyzers sequentially:
    │                               analyzeImports()   → fileModel.imports
    │                               analyzeFunctions() → fileModel.functions
    │                               analyzeExports()   → fileModel.exports
    │                               analyzeClasses()   → fileModel.classes
    │                               analyzeRoutes()    → fileModel.routes (Express patterns)
    │                               analyzeReactComponents() → fileModel.components
    │       project.addFile(fileModel)
    │
    └── returns ProjectModel { projectName, files: FileModel[] }

DocumentationEngine.generateDocumentation(projectModel, outputDir, options)
    │
    ├── buildDependencyGraph()  → directed graphlib Graph (nodes=files, edges=local imports)
    ├── computeMetrics()        → { fanIn, fanOut, LOC, complexity, circularDeps, deadFiles, unusedExports }
    ├── [optional --ai] generateAISummaries() → Groq openai/gpt-oss-20b, populates fileModel.aiSummary
    ├── generateMarkdown()      → output/<filepath>.md per file
    ├── generateMermaid()       → output/dependencies.mermaid + output/classes.mermaid
    ├── generateArchitectureReport() → output/ARCHITECTURE.md
    ├── generateFolderSummaries()    → per-folder README summaries
    ├── buildRepositoryIndex()  → flat array of all chunks → output/repository_index.json
    └── buildAndSaveVectorStore()    → embed all chunks → output/vector_store.json

Knowledge Layer (on search/chat):
    searchRepository(query)
        │
        ├── load vector_store.json into VectorStore.entries[]
        ├── generateEmbedding(query)   → ⚠ 128-dim FNV-1a hash vector
        └── VectorStore.search()       → ⚠ brute-force cosine scan → top-K chunks

Chat Engine (chatEngine.js):
    askRepository(query) / startInteractiveChat()
        │
        ├── searchRepository()             → retrieve top-5 relevant chunks
        ├── [if arch query] read ARCHITECTURE.md → inject as context
        ├── [always] getDataFlowContext()  → extract matching edges from dependencies.mermaid
        ├── buildRAGPrompt()               → assemble system + context + user question
        └── groq.chat.completions.create() → openai/gpt-oss-20b, max_tokens: 1024, temp: 0.2

Agent Engine (agentEngine.js):
    executeAgentTask(taskType, targetFile, outputDir)
        │
        ├── getArchitectureContext()       → read ARCHITECTURE.md
        ├── getDependencyGraphContext()    → read dependencies.mermaid
        ├── getTargetFileContext()         → read raw file source (for refactor/test/impact)
        └── groq.chat.completions.create() → task-specific prompt, max_tokens: 2048, temp: 0.2
            Tasks: refactor | test | readme | review | impact | quality
```

---

## 4. Data Models

### FileModel
```js
{
  path: string,          // relative path from project root e.g. "src/core/DependencyGraph.js"
  sourceCode: string,    // raw file content
  ast: BabelAST,         // Babel File node
  aiSummary: string,     // populated by aiGenerator.js if --ai flag used
  imports: [{ source, type: "local"|"external", specifiers }],
  exports: [{ name, type, source }],
  functions: [{ name, async, params, loc, type }],
  classes: [{ name, superClass, properties, methods:[{name}], loc }],
  routes: [{ method, path, handler, middleware, loc }],
  components: [{ name, props, hooks, jsxChildren, loc }]
}
```

### ProjectModel
```js
{
  projectName: string,   // basename of the scanned directory
  files: FileModel[]
}
```

### Chunk (knowledge layer)
```js
{
  id: string,            // "file:src/core/X.js" | "class:src/...#ClassName" | "function:...#fnName" | "route:...#METHOD:path" | "component:...#Name"
  type: "file" | "class" | "function" | "route" | "component",
  filePath: string,
  name: string,
  loc: { start: { line, column }, end: { line, column } },
  content: string,       // sliced source code or descriptive text
  metadata: {}           // type-specific fields (methods, params, hooks, etc.)
}
```

---

## 5. CLI Commands

```bash
# Default: generate docs + knowledge store
npx faro generate <projectPath> [--ai]

# Semantic search over vector store
npx faro search "<query>" [-o outputDir] [-k topK]

# Ask a single question
npx faro chat "<question>" [-o outputDir]

# Interactive REPL chat
npx faro chat [-o outputDir]

# Agent task
npx faro agent <taskType> [targetFile] [-o outputDir]
# taskType: refactor | test | readme | review | impact | quality
```

---

## 6. Tech Stack (Current State)

| Concern | Package | Version | Notes |
|---|---|---|---|
| CLI framework | commander | ^15.0.0 | |
| AST parsing | @babel/parser, @babel/traverse, @babel/types | ^7.29.7 | sourceType: unambiguous |
| Dependency graph | graphlib | ^2.1.8 | directed graph |
| File scanning | glob | ^13.0.6 | |
| Mermaid output | Raw string generation | — | No mermaid package needed |
| Embeddings | native fetch | — | gemini-embedding-001, 768-dim |
| Vector store | @qdrant/js-client-rest | ^1.12.0 | Qdrant vector database |
| LLM | groq-sdk | ^1.3.0 | model: openai/gpt-oss-20b |
| Terminal UI | chalk, ora | ^5.6.2, ^9.4.1 | |
| Env vars | dotenv | ^17.4.2 | |
| Module system | ES Modules only | — | `"type": "module"` in package.json |
| Runtime | Node.js | >=20 | |

### Environment Variables
```
GROQ_API_KEY=gsk_...   # Required for chat, agent, and --ai flag
GOOGLE_API_KEY=...     # Required for Gemini Embeddings
QDRANT_URL=http://...  # Qdrant vector DB url
```

---

## 7. Known Limitations (as of Phase 0 / baseline)

1. ~~**Embeddings are not semantic.** `embeddingGenerator.js` uses FNV-1a hash bags — a 128-dimensional TF-IDF approximation. Searching for "authentication logic" will not return results semantically related to "login handler" unless they share tokens. This is the most critical limitation.~~ *(Resolved in Phase 1)*

2. ~~**Vector store is a flat JSON file.** `vector_store.json` is loaded entirely into memory on every search. No indexing, no filtering, no persistence between Faro instances. Does not scale.~~ *(Resolved in Phase 1)*

3. **No LangChain/LangGraph.** The RAG pipeline and agent are hand-rolled. They work but are not composable, not evaluatable with standard tooling, and cannot be swapped out without rewriting them.

4. **No persistence for chat sessions.** Conversation history is kept in-memory only. Restarting the CLI loses context.

5. **Scanner only covers `.js` files.** TypeScript, JSX, and TSX files are not scanned.

6. **No test suite.** `package.json` has `"test": "echo No tests yet"`.

7. **CLI-only interface.** No API server, no web UI — not demonstrable to non-technical people.

---

## 8. Architecture Decisions & Rationale

- **ES Modules only** — enforced via `"type": "module"` in package.json. All imports use `.js` extension. Do not introduce CommonJS.
- **ProjectModel as single source of truth** — all generators and the knowledge layer consume `ProjectModel`. Raw file access in generators is prohibited.
- **Analyzers are pure functions** — each analyzer takes a `FileModel` and mutates it in-place. They are stateless and independently testable.
- **AnalyzerEngine is a registry** — add a new analyzer by importing and pushing to the `analyzers` array.
- **groqClient is a shared factory** — import `createGroqClient()` from `src/core/groqClient.js`. Never instantiate `new Groq()` directly elsewhere.
- **Output directory convention** — all artefacts go to `./output/` by default. This is configurable via `--output` CLI flag.

---

## 9. Development Status

| Phase | Name | Status |
|---|---|---|
| 0 | Baseline (CLI, AST, Analyzers, ProjectModel, Mermaid, RAG, Agent) | ✅ Complete |
| 1 | Real Embeddings + Qdrant Vector DB | ✅ Complete |
| 2 | LangChain RAG Pipeline | ⬜ Not started |
| 3 | LangGraph Agentic Workflow | ⬜ Not started |
| 4 | MCP Server | ⬜ Not started |
| 5 | Web API + Frontend | ⬜ Not started |

---

## 10. Update Log

| Date | Phase completed | Summary of changes |
|---|---|---|
| Baseline | Phase 0 | Full CLI, AST pipeline, RAG with hash embeddings and JSON vector store, Groq chat and agent |
| 2026-09-26 | Phase 1 | Replaced hash embeddings with Gemini Embeddings (gemini-embedding-001, 768-dim) and moved to Qdrant vector DB via Docker. |

