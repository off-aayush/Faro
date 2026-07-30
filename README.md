# Faro: Intelligence Beyond the Repository

Faro is a powerful, AI-driven Repository Intelligence Platform. It goes beyond simple documentation generation by parsing your entire codebase, generating an internal knowledge model, and powering an interactive AI assistant and Engineering Agent capable of reasoning about your project's architecture.

This guide provides step-by-step instructions on how to run and utilize all features of the Faro project.

---

## Prerequisites

Faro leverages **Groq** for high-speed, accurate AI inference using the `llama-3.1-8b-instant` model.

1. Get a free API key at [Groq Console](https://console.groq.com/keys)
2. Create a `.env` file in the root of the Faro repository and add your key:
   ```env
   GROQ_API_KEY=gsk_your_key_here
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

---

## Step-by-Step Usage Guide

Faro provides a robust CLI with various subcommands. You can run the CLI directly using node:
```bash
node src/index.js <command>
```
*(Alternatively, you can link the project via `npm link` to run `Faro <command>` globally).*

### Step 1: Generate the Knowledge Layer
Before you can chat with the AI or run engineering tasks, you must parse the repository and generate the knowledge store (AST analysis, metrics, vector embeddings, etc.).

**Command:**
```bash
node src/index.js generate <path-to-your-project>
```
**Example (run against Faro itself):**
```bash
node src/index.js generate ./
```

**Options:**
- `--ai`: Opt-in flag to generate AI narrative summaries for your folders and files.
  ```bash
  node src/index.js generate ./ --ai
  ```

**What this does:**
This command populates the `output/` directory with:
- `ARCHITECTURE.md`: A high-level view of your project's metrics and coupling.
- `dependencies.mermaid`: A visual dependency graph.
- `vector_store.json`: The semantic embedding knowledge base used for RAG (Retrieval-Augmented Generation).
- Markdown documentation for every file and folder.

---

### Step 2: Semantic Search (Querying the Codebase)
Once the knowledge layer is built, you can instantly search for concepts, functions, or patterns across your repository using vector embeddings.

**Command:**
```bash
node src/index.js search "<your query>"
```
**Example:**
```bash
node src/index.js search "How are embeddings generated?"
```

**Options:**
- `-k, --top <number>`: Number of top search results to return (default is 5).
- `-o, --output <dir>`: Custom path to the knowledge store output directory (default is `output`).

---

### Step 3: Interactive Chat Assistant
Chat with your repository. The AI contextually understands your codebase by pulling in global architecture data, dependency edges, and semantically matching code chunks.

**Single-Shot Mode (Ask one question and exit):**
```bash
node src/index.js chat "Explain the core data flow of this project."
```

**Interactive REPL Mode (Stay in the chat loop):**
```bash
node src/index.js chat
```
Once in the REPL, simply type your questions:
```
Faro > Where is the metrics calculation implemented?
Faro > Which files are importing the chatEngine?
```
*(Type `exit`, `quit`, or `q` to leave).*

---

### Step 4: The Engineering Agent
The repository Engineering Agent acts as an expert software architect, automating complex engineering tasks based on the contextual state of your repository.

**Command:**
```bash
node src/index.js agent <taskType> [targetFile]
```

**Global Tasks (Repository-wide analysis):**
- **Architecture Review:** Identify potential bottlenecks and technical debt.
  ```bash
  node src/index.js agent review
  ```
- **Code Quality Report:** Highlight coupling issues, circular dependencies, and overly complex components.
  ```bash
  node src/index.js agent quality
  ```
- **Generate README:** Have the AI draft a comprehensive README based on architecture and metrics.
  ```bash
  node src/index.js agent readme
  ```

**File-Specific Tasks (Requires `[targetFile]` parameter):**
- **Impact Analysis:** Predict what will break if you modify a specific file (analyzes dependency edges).
  ```bash
  node src/index.js agent impact src/core/AnalyzerEngine.js
  ```
- **Refactoring Suggestions:** Get concrete refactoring advice for a specific file.
  ```bash
  node src/index.js agent refactor src/knowledge/searchEngine.js
  ```
- **Test Generation:** Generate Jest unit tests targeting edge cases for a specific file.
  ```bash
  node src/index.js agent test src/cli/index.js
  ```

---

## Technical Overview
Faro is fully ES Module compatible and designed using a modular architecture:
*   **Analyzers** (`src/analyzers`): Pure AST parsers that analyze your code statically.
*   **Knowledge** (`src/knowledge`): The embedding generation, semantic indexer, and search engine.
*   **Generators** (`src/generators`): Outputs Mermaid charts, Architecture reports, and standard Markdown.
*   **Chat & Agent** (`src/chat`, `src/agent`): High-level intelligent systems that consume the parsed `ProjectModel`.
