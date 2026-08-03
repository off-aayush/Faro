# faro Contributor Guide

Welcome to the **faro** project! This guide is designed to give you a complete overview of the project's architecture, current state, and how you can help take it further.

## What is faro?

`faro` is an automated technical documentation generator for JavaScript projects. Instead of relying on manual documentation or simple regex parsing, it uses **Abstract Syntax Trees (AST)** via Babel to deeply understand the codebase. It extracts metadata about functions, classes, exports, imports, and API routes, and then automatically generates Markdown documentation and Mermaid.js diagrams.

## Architecture Overview

The project is structured into distinct, modular pipelines:

1. **CLI (`src/cli`)**: The entry point. Uses `commander` to parse the `<projectPath>` argument from the terminal.
2. **Scanner (`src/scanner`)**: Uses `glob` and `ignore` (respecting `.gitignore`) to discover all relevant JavaScript files in the target directory.
3. **Parser (`src/parser`)**: Reads the file contents and uses `@babel/parser` to convert the raw JavaScript code into an AST.
4. **Models (`src/model`)**: 
   - `FileModel`: Represents a single file, containing its AST and empty arrays for extracted data (functions, classes, etc.).
   - `ProjectModel`: A collection of all `FileModel`s in the project.
5. **Analyzers (`src/analyzers`)**: The core logic. Each analyzer uses `@babel/traverse` to visit specific AST nodes and extract metadata:
   - `classAnalyzer.js`: Extracts classes, properties, methods, and superclasses.
   - `functionAnalyzer.js`: Extracts function declarations, arrow functions, and class methods.
   - `exportAnalyzer.js`: Identifies named, default, and all-exports.
   - `importAnalyzer.js`: Maps local and external package dependencies.
   - `routeAnalyzer.js`: Detects Express.js routing patterns (e.g., `app.get()`).
6. **Core Engine (`src/core`)**:
   - `ProjectLoader.js`: Orchestrates the scanning and parsing.
   - `AnalyzerEngine.js`: Runs all the analyzers over every file's AST.
   - `DependencyGraph.js`: Uses `graphlib` to build a directed graph of the project's file imports.
   - `DocumentationEngine.js`: The final orchestrator that triggers the generators.
7. **Generators (`src/generators`)**:
   - `markdownGenerator.js`: Uses `markdown-table` to output structured `.md` files replicating the source directory structure.
   - `mermaidGenerator.js`: Generates `dependencies.mermaid` (flowchart) and `classes.mermaid` (UML).

## Getting Started Locally

1. Clone the repository and install dependencies: `npm install`
2. Run the tool against its own source code for a quick test: 
   ```bash
   npm run start -- ./src
   ```
3. Check the `output/` directory for the generated Markdown and Mermaid files.

## Roadmap & How to Contribute

Here are the most impactful ways to take `faro` to the next level:

- **AI Documentation Integration**: We have a scaffold in `src/core/DocumentationEngine.js`. We want to integrate an LLM (like Gemini or OpenAI API) to automatically generate human-readable summaries and explanations alongside the AST metadata.
- **TypeScript Support**: Update the `@babel/parser` configuration in `src/parser/parser.js` to parse `.ts` and `.tsx` files, and extract type annotations.
- **Frontend Framework Analyzers**: Build specific analyzers for React (detecting Components, Hooks, Props) or Vue.
- **Enhanced Routing**: Improve `routeAnalyzer.js` to detect React Router, Vue Router, or other backend frameworks like Fastify and NestJS.
- **Unit Testing**: We currently lack automated tests. Setting up a testing framework (e.g., Jest or Vitest) and writing tests for the AST analyzers would be a massive win for stability.

Feel free to dive into any of the `src/analyzers` to see how simple it is to extract new information using the AST!
