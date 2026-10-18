import chalk from "chalk";
import { generateEmbedding, EmbeddingError } from "./embeddingGenerator.js";
import { VectorStore } from "./vectorStore.js";

/**
 * Embed chunks, skip individual embedding errors, and save Qdrant metadata.
 *
 * @param {Object[]} chunks
 * @param {string} outputDir
 * @param {string} projectName
 * @returns {Promise<VectorStore>}
 */
export async function buildAndSaveVectorStore(chunks, outputDir, projectName) {
    const store = new VectorStore(projectName);
    const BATCH_SIZE = 20;
    const DELAY_MS = 1500; // stay well under 100 RPM
    let skipped = 0;
    let embedded = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);

        await Promise.all(
            batch.map(async (chunk) => {
                try {
                    const vector = await generateEmbedding(chunk.content);
                    await store.add(chunk, vector);
                    embedded++;
                } catch (error) {
                    if (!(error instanceof EmbeddingError)) throw error;
                    skipped++;
                    console.warn(chalk.yellow(`[SKIP] ${chunk.id} — embedding failed: ${error.message}`));
                }
            })
        );

        const progress = Math.min(i + BATCH_SIZE, chunks.length);
        process.stdout.write(chalk.blue(`\r  Embedding chunks: ${progress}/${chunks.length}`));

        // Delay between batches to respect rate limits
        if (i + BATCH_SIZE < chunks.length) {
            await new Promise(r => setTimeout(r, DELAY_MS));
        }
    }

    console.log(chalk.blue(`\nEmbedded ${embedded}/${chunks.length} chunks (${skipped} skipped due to embedding errors)`));
    const failureRate = chunks.length ? skipped / chunks.length * 100 : 0;
    if (failureRate > 20) {
        throw new Error(`Embedding failure rate too high (${Math.round(failureRate)}%). Check your GOOGLE_API_KEY and rate limits.`);
    }
    await store.save(outputDir);
    return store;
}

/**
 * Perform semantic search against the pre-built vector store in outputDir.
 *
 * @param {string} query - Natural language or code search term
 * @param {string} outputDir - Directory containing qdrant_meta.json
 * @param {number} topK - Maximum number of results to return
 * @returns {Promise<Array<{ score: number, chunk: Object }>>}
 */
export async function searchRepository(query, outputDir = "output", topK = 5) {
    const store = new VectorStore();
    const loaded = await store.load(outputDir);

    if (!loaded) {
        console.error(chalk.red(`\nVector store not found or Qdrant collection missing.`));
        console.log(chalk.yellow("  Run 'node src/index.js generate <projectPath>' with GOOGLE_API_KEY and Qdrant available.\n"));
        return [];
    }

    const queryVector = await generateEmbedding(query, 3, 'RETRIEVAL_QUERY');
    const results = await store.search(queryVector, topK);

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

        console.log(chalk.dim(""));
    });
}
