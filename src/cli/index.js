#!/usr/bin/env node

import { Command } from "commander";
import { loadProject } from "../core/ProjectLoader.js";
import { generateDocumentation } from "../core/DocumentationEngine.js";
import { searchRepository, displaySearchResults } from "../knowledge/searchEngine.js";
import { askRepository, startInteractiveChat } from "../chat/chatEngine.js";
import { executeAgentTask } from "../agent/agentEngine.js";
import chalk from "chalk";

export async function startCLI() {
    const program = new Command();

    program
        .name("faro")
        .description("Repository Intelligence Platform & Technical Documentation Generator")
        .version("1.0.0");

    program
        .command("generate <projectPath>", { isDefault: true })
        .description("Generate technical documentation & repository knowledge store")
        .option("--ai", "Generate AI narrative summaries using Groq (requires GROQ_API_KEY)")
        .action(async (projectPath, options) => {
            const project = await loadProject(projectPath);
            await generateDocumentation(project, "output", options);
        });

    program
        .command("search <query>")
        .description("Perform semantic vector search over the repository knowledge store")
        .option("-o, --output <outputDir>", "Path to output directory containing vector_store.json", "output")
        .option("-k, --top <topK>", "Number of top search results to return", "5")
        .action(async (query, options) => {
            const results = await searchRepository(query, options.output, parseInt(options.top, 10));
            displaySearchResults(query, results);
        });

    program
        .command("chat [query]")
        .description("Ask the Faro AI assistant about your codebase. Omit query for interactive REPL mode.")
        .option("-o, --output <outputDir>", "Path to output directory containing vector_store.json", "output")
        .action(async (query, options) => {
            if (query) {
                // Single-shot mode
                await askRepository(query, options.output);
            } else {
                // Interactive REPL mode
                await startInteractiveChat(options.output);
            }
        });

    program
        .command("agent <taskType> [targetFile]")
        .description("Run a repository engineering agent task (refactor, test, readme, review, impact, quality)")
        .option("-o, --output <outputDir>", "Path to output directory containing knowledge store", "output")
        .action(async (taskType, targetFile, options) => {
            try {
                await executeAgentTask(taskType, targetFile, options.output);
            } catch (err) {
                console.error(chalk.red(`\n  Error: ${err.message}\n`));
                process.exit(1);
            }
        });

    await program.parseAsync();
}

