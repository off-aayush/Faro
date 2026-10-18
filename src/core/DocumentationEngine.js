import "dotenv/config";
import chalk from "chalk";
import { buildDependencyGraph } from "./DependencyGraph.js";
import { generateMarkdown } from "../generators/markdownGenerator.js";
import { generateMermaid } from "../generators/mermaidGenerator.js";
import { generateAISummaries } from "../generators/aiGenerator.js";
import { computeMetrics } from "../analyzers/metricsAnalyzer.js";
import { generateArchitectureReport } from "../generators/architectureReportGenerator.js";
import { generateFolderSummaries } from "../generators/folderSummaryGenerator.js";
import { buildRepositoryIndex, saveRepositoryIndex } from "../knowledge/indexer.js";
import { buildAndSaveVectorStore } from "../knowledge/searchEngine.js";
import { VectorStore } from "../knowledge/vectorStore.js";

/** Generate all static documentation from one ProjectModel. */
export async function generateDocs(projectModel, outputDir, options = {}) {
    console.log(chalk.blue("Building dependency graph..."));
    const graph = buildDependencyGraph(projectModel);
    console.log(chalk.blue("Computing repository metrics..."));
    const metrics = computeMetrics(projectModel, graph);

    let aiEnabled = Boolean(options.ai && process.env.GROQ_API_KEY?.trim());
    if (options.ai) {
        if (!aiEnabled) {
            console.warn(chalk.yellow("AI summaries skipped — set GROQ_API_KEY to enable them"));
        } else {
            try {
                await generateAISummaries(projectModel);
            } catch (error) {
                console.warn(chalk.yellow(`AI summaries skipped — ${error.message}`));
                aiEnabled = false;
            }
        }
    }

    console.log(chalk.blue("Generating markdown files..."));
    await generateMarkdown(projectModel, outputDir);
    console.log(chalk.blue("Generating mermaid diagrams..."));
    await generateMermaid(graph, projectModel, outputDir);
    console.log(chalk.blue("Generating architecture report..."));
    await generateArchitectureReport(metrics, projectModel, outputDir);
    console.log(chalk.blue("Generating folder summaries..."));
    await generateFolderSummaries(projectModel, outputDir, { ...options, ai: aiEnabled });
    console.log(chalk.green(`Documentation generated in ${outputDir}`));
}

/** Build and persist one repository index, then embed those same chunks. */
export async function generateKnowledge(projectModel, outputDir) {
    const chunks = buildRepositoryIndex(projectModel);
    await saveRepositoryIndex(chunks, outputDir);
    await buildAndSaveVectorStore(chunks, outputDir, projectModel.projectName);
    return chunks;
}

/** Check whether credentials and Qdrant are available for knowledge generation. */
export async function canGenerateKnowledge(projectName) {
    if (!process.env.GOOGLE_API_KEY?.trim()) return false;
    const store = new VectorStore(projectName);
    try {
        await store.client.getCollections();
        return true;
    } catch {
        return false;
    }
}

/** Run documentation unconditionally and knowledge generation when available. */
export async function generateDocumentation(projectModel, outputDir, options = {}) {
    await generateDocs(projectModel, outputDir, options);
    if (!(await canGenerateKnowledge(projectModel.projectName))) {
        console.warn(chalk.yellow("Knowledge layer skipped — set GOOGLE_API_KEY and start Qdrant to enable semantic search"));
        return;
    }
    await generateKnowledge(projectModel, outputDir);
    console.log(chalk.green(`Knowledge store generated in ${outputDir}`));
}
