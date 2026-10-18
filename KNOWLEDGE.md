# Faro — Project Knowledge Base

> Update this document when a development phase completes. `ProjectModel` is the source of truth for documentation, metrics, graphs, and the knowledge layer.

## 1. Project Vision

Faro is a Repository Intelligence Platform for JavaScript and TypeScript projects. It scans source code, builds a static model, produces Markdown and Mermaid documentation, and can add semantic search and repository chat when its external services are available.

## 2. Repository Structure

```text
src/
  cli/index.js                    Commander CLI: generate, reindex, status, search, chat, agent
  core/ProjectLoader.js           Scan, parse, and analyze into ProjectModel
  core/AnalyzerEngine.js          Runs all analyzers
  core/DependencyGraph.js         Graph from imports, including resolved index files
  core/DocumentationEngine.js     Separate documentation and knowledge stages
  core/groqClient.js              createGroqClient() and GROQ_MODEL
  model/{FileModel,ProjectModel}.js
  scanner/scanProject.js          Scans .js, .jsx, .ts, .tsx with standard ignores
  parser/{parser,traverse}.js     Babel parsing and traversal; malformed files skipped
  analyzers/                     Imports, exports, functions, classes, routes, React, metrics
  generators/                    Markdown, Mermaid, architecture, folders, optional AI summaries
  knowledge/chunker.js           Typed semantic chunks
  knowledge/indexer.js           One repository_index.json per generation
  knowledge/embeddingGenerator.js Gemini REST embeddings and EmbeddingError
  knowledge/vectorStore.js       Qdrant query/upsert, deterministic point IDs
  knowledge/searchEngine.js      Embedding batches and semantic search
  knowledge/langchainRetriever.js Custom BaseRetriever for Faro's Qdrant payload
  chat/contextHelpers.js         Architecture and data-flow context, legacy prompt helper
  chat/ragChain.js               LangChain LCEL RAG chain
  chat/chatEngine.js             Single question and history-aware REPL
  agent/agentEngine.js           Engineering agent tasks
output/
  ARCHITECTURE.md, dependencies.mermaid, classes.mermaid
  repository_index.json, qdrant_meta.json, per-file and per-folder Markdown
```

The unused legacy API client was deleted. The knowledge vectors live in Qdrant; the local JSON files hold chunk and collection metadata.

## 3. Full Pipeline

```text
generate <projectPath>
  ProjectLoader.loadProject()
    scan **/*.{js,jsx,ts,tsx} (ignoring node_modules, .git, dist, build, coverage)
    read and parse each file once; warn and skip parse failures
    analyze valid FileModels, using the valid project file list for import resolution
    -> ProjectModel { projectName, files }
  generateDocs(projectModel, outputDir, options) [always]
    dependency graph -> metrics -> optional Groq AI summaries
    -> Markdown -> Mermaid -> ARCHITECTURE.md -> folder summaries
  generateKnowledge(projectModel, outputDir) [when GOOGLE_API_KEY and Qdrant are available]
    buildRepositoryIndex() once -> repository_index.json
    -> embed chunks via Gemini -> skip EmbeddingError chunks
    -> abort when failures exceed 20% -> Qdrant upsert
    -> qdrant_meta.json { collectionName, totalPoints, timestamp }
```

Qdrant collection names are `faro_vectors_<projectname>` with lowercase letters, numbers, and underscores. Each point ID is a stable FNV-1a hash of `chunk.id` reduced to a safe integer. Repeating generate overwrites the same logical points. `reindex <projectPath>` deletes that project's collection, then runs the full generate pipeline. `status` reads local metadata and reports the verified collection's point count and vector dimension.

```text
search <query>
  qdrant_meta.json -> verify collection -> Gemini RETRIEVAL_QUERY embedding
  -> Qdrant query() -> top-K chunks

chat [query]
  custom BaseRetriever -> Qdrant query() -> chunk Documents
  -> architecture and dependency context -> ChatPromptTemplate
  -> prior user/assistant turns (REPL) + current question
  -> ChatGroq via LangChain LCEL -> streamed answer
```

The REPL keeps a bounded history in memory. The agent reads generated context and calls Groq for refactor, test, readme, review, impact, and quality tasks.

## 4. Data Models

```js
ProjectModel { projectName: string, files: FileModel[] }
FileModel {
  path, sourceCode, ast, aiSummary,
  imports: [{ source, type: 'local'|'external'|'dynamic', specifiers,
              isDynamic, isRequire, resolvedPath? }],
  exports, functions, classes, routes,
  components: [{ name, props, hooks, jsxChildren, loc }]
}
Chunk {
  id, type: 'file'|'class'|'function'|'route'|'component',
  filePath, name, loc, content, metadata
}
```

Chunks are derived from FileModels. The index contains no vectors. `qdrant_meta.json` identifies the collection; Qdrant stores the vectors and full chunk payloads.

## 5. CLI Commands

```bash
node src/index.js generate <projectPath> [--ai]
node src/index.js reindex <projectPath> [--ai]
node src/index.js status
node src/index.js search "<query>" [-o outputDir] [-k topK]
node src/index.js chat [query] [-o outputDir]
node src/index.js agent <taskType> [targetFile] [-o outputDir]
```

Omitting `query` starts the chat REPL. The command names and arguments are unchanged.

## 6. Tech Stack

| Concern | Package/API | Notes |
|---|---|---|
| Runtime and modules | Node.js >=20, ES Modules | `type: module` |
| CLI | commander, chalk | User-facing output is colored |
| Scanning and parsing | glob, @babel/parser, @babel/traverse | JSX and TypeScript plugins |
| Graph | graphlib | Directed import graph |
| Embeddings | Google Gemini `gemini-embedding-001` via REST (v1beta) | 768-dimensional normalized vectors |
| Vector database | @qdrant/js-client-rest, Qdrant | `query()` API, project collections, deterministic IDs |
| LLM | `openai/gpt-oss-20b` via Groq SDK | `GROQ_MODEL` constant in `groqClient.js` |
| RAG | LangChain LCEL, @langchain/groq, custom BaseRetriever | Faro payload mapping and prompt history |
| Environment | dotenv | `.env` loaded by CLI pipeline |

`GOOGLE_API_KEY` enables embeddings and semantic search. `GROQ_API_KEY` enables chat, agent tasks, and `--ai` summaries. `QDRANT_URL` defaults to `http://localhost:6333`. LangSmith tracing variables are optional.

## 7. Known Limitations

- Chat history is in memory and is lost when the CLI exits.
- No automated test suite is configured in `package.json`.
- The interface is CLI-only.
- Resolved in stabilization: duplicate index build, chat/RAG circular dependency, zero-vector corruption, unused chat history, inconsistent collection naming, and limited source extensions.

## 8. Architecture Decisions

- ES Modules only; use `.js` extensions for local imports.
- `ProjectModel` is the single source for generated outputs.
- Analyzers mutate one FileModel, while the loader supplies the valid project file list to import analysis.
- Documentation generation works without external services. Knowledge generation is conditional on Gemini credentials and Qdrant availability.
- `createGroqClient()` and `GROQ_MODEL` centralize Groq SDK configuration.
- Generated artifacts go to `output/` by default.

## 9. Development Status

| Phase | Name | Status |
|---|---|---|
| 0 | Baseline CLI, static model, documentation, chat, agent | ✅ Complete |
| 1 | Gemini embeddings and Qdrant | ✅ Complete |
| 2 | LangChain LCEL RAG | ✅ Complete |
| Stabilization | Correctness, configuration, scanner and analyzer repairs | ✅ Complete |
| 3 | LangGraph agentic workflow | Not started |
| 4 | MCP server | Not started |
| 5 | Web API and frontend | Not started |

## 10. Update Log

| Date | Phase | Summary |
|---|---|---|
| Baseline | 0 | CLI, AST pipeline, documentation, chat, agent |
| 2026-09-26 | 1 | Gemini embeddings and Qdrant |
| 2026-09-29 | 2 | LCEL RAG and custom Qdrant retriever |
| 2026-10-18 | Stabilization | Split docs/knowledge stages; corrected embeddings, IDs, collection lifecycle, chat history, parser/scanner/import/React analysis, and setup guidance. |
