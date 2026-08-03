import chalk from "chalk";
import { buildRepositoryIndex } from "./indexer.js";
import { generateEmbedding } from "./embeddingGenerator.js";
import { VectorStore } from "./vectorStore.js";

/**
 * Build vector embeddings for all chunks in the ProjectModel and save vector store to outputDir.
 *
 * @param {import("../model/ProjectModel.js").ProjectModel} projectModel
 * @param {string} outputDir
 * @returns {Promise<VectorStore>}
 */
export async function buildAndSaveVectorStore(projectModel, outputDir) {
    console.log(chalk.blue("Building vector store & generating embeddings..."));

    const chunks = buildRepositoryIndex(projectModel);
    const store = new VectorStore();

    for (const chunk of chunks) {
        // Embed chunk content + metadata for max semantic richness
        const textToEmbed = `${chunk.filePath} ${chunk.name} ${chunk.content}`;
        const vector = generateEmbedding(textToEmbed);
        store.add(chunk, vector);
    }

    await store.save(outputDir);
    return store;
}

/**
 * Perform semantic search against the pre-built vector store in outputDir.
 *
 * @param {string} query - Natural language or code search term
 * @param {string} outputDir - Directory containing vector_store.json
 * @param {number} topK - Maximum number of results to return
 * @returns {Promise<Array<{ score: number, chunk: Object }>>}
 */
export async function searchRepository(query, outputDir = "output", topK = 5) {
    const store = new VectorStore();
    const loaded = await store.load(outputDir);

    if (!loaded) {
        console.error(chalk.red(`\nVector store not found in '${outputDir}/vector_store.json'.`));
        console.log(chalk.yellow("  Run 'npx faro <projectPath>' first to build the knowledge layer index.\n"));
        return [];
    }

    const queryVector = generateEmbedding(query);
    const results = store.search(queryVector, topK);

    return results;
}

/**
 * Format and print semantic search results to console.
 *
 * @param {string} query
 * @param {Array<{ score: number, chunk: Object }>} results
 */
export function displaySearchResults(query, results) {
    console.log(chalk.cyan(`\n🔍 Semantic Search Results for: "${chalk.bold(query)}"\n`));

    if (!results || results.length === 0) {
        console.log(chalk.yellow("  No matching code chunks found.\n"));
        return;
    }

    results.forEach((res, idx) => {
        const { score, chunk } = res;
        const confidencePct = Math.round(score * 100);
        
        let headerColor = chalk.green;
        if (confidencePct < 40) headerColor = chalk.yellow;
        if (confidencePct < 20) headerColor = chalk.dim;

        console.log(headerColor(`[${idx + 1}] ${chunk.type.toUpperCase()}: ${chunk.id} (Relevance: ${confidencePct}%)`));
        console.log(chalk.dim(`    File: ${chunk.filePath}`));
        
        if (chunk.loc) {
            console.log(chalk.dim(`    Lines: L${chunk.loc.start.line}-L${chunk.loc.end.line}`));
        }

        console.log(chalk.gray(`    ──────────────────────────────────────────────────`));
        
        // Print snippet (max 8 lines preview)
        const contentLines = chunk.content.split("\n");
        const preview = contentLines.slice(0, 8).map(l => `    ${l}`).join("\n");
        console.log(chalk.white(preview));

        if (contentLines.length > 8) {
            console.log(chalk.dim(`    ... (+${contentLines.length - 8} more lines)`));
        }

        console.log();
    });
}
