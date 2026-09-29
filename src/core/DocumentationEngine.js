import "dotenv/config";
import { buildDependencyGraph } from "./DependencyGraph.js";
import { generateMarkdown } from "../generators/markdownGenerator.js";
import { generateMermaid } from "../generators/mermaidGenerator.js";
import { generateAISummaries } from "../generators/aiGenerator.js";
import { computeMetrics } from "../analyzers/metricsAnalyzer.js";
import { generateArchitectureReport } from "../generators/architectureReportGenerator.js";
import { generateFolderSummaries } from "../generators/folderSummaryGenerator.js";
import { buildRepositoryIndex, saveRepositoryIndex } from "../knowledge/indexer.js";
import { buildAndSaveVectorStore } from "../knowledge/searchEngine.js";
import chalk from "chalk";

export async function generateDocumentation(projectModel, outputDir, options = {}) {
    console.log(chalk.blue("Building dependency graph..."));
    const dependencyGraph = buildDependencyGraph(projectModel);

    console.log(chalk.blue("Computing repository metrics..."));
    const metrics = computeMetrics(projectModel, dependencyGraph);

    // ── AI Summaries (opt-in via --ai flag) ──────────────────────────────────
    // Run BEFORE markdown generation so summaries are embedded inline.
    if (options.ai) {
        console.log(chalk.blue("\nGenerating AI narrative summaries..."));
        try {
            await generateAISummaries(projectModel);
        } catch (err) {
            console.error(chalk.red(`\n  AI generation failed: ${err.message}`));
            console.log(chalk.yellow("  Continuing without AI summaries...\n"));
        }
    }

    console.log(chalk.blue("\nGenerating markdown files..."));
    await generateMarkdown(projectModel, outputDir);

    console.log(chalk.blue("Generating mermaid diagrams..."));
    await generateMermaid(dependencyGraph, projectModel, outputDir);

    console.log(chalk.blue("Generating architecture report..."));
    await generateArchitectureReport(metrics, projectModel, outputDir);

    console.log(chalk.blue("Generating folder summaries..."));
    await generateFolderSummaries(projectModel, outputDir, options);

    console.log(chalk.blue("Generating repository index..."));
    const repositoryIndex = buildRepositoryIndex(projectModel);
    await saveRepositoryIndex(repositoryIndex, outputDir);

    // await buildAndSaveVectorStore(projectModel, outputDir);

    // // Build index first, then pass chunks to vector store
    // const spinner = ora('Building vector store & generating embeddings...').start();
    // const chunks = buildRepositoryIndex(projectModel, outputDir);

    // if (!chunks || chunks.length === 0) {
    //     spinner.warn('No chunks generated — skipping vector store build.');
    // } else {
    //     await buildAndSaveVectorStore(chunks, outputDir);
    //     spinner.succeed(`Embedded ${chunks.length} chunks successfully.`);
    // }

    const chunks = await buildRepositoryIndex(projectModel, outputDir);
    await buildAndSaveVectorStore(chunks, outputDir);

    console.log(chalk.green(`\nDocumentation & Knowledge Store generated successfully in ${outputDir}!`));
    if (options.ai) {
        console.log(chalk.dim("  Tip: AI summaries are embedded in each file's ## AI Summary section.\n"));
    }
}
