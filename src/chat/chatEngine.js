import Groq from "groq-sdk";
import readline from "readline";
import chalk from "chalk";
import "dotenv/config";
import fs from "fs-extra";
import path from "path";
import { searchRepository } from "../knowledge/searchEngine.js";

const GROQ_MODEL = "llama-3.1-8b-instant";

/**
 * Initialize Groq API client from environment variables.
 *
 * @returns {Groq}
 */
function createGroqClient() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
        throw new Error(
            "GROQ_API_KEY is not set in environment or .env file.\n" +
            "  1. Get a free key at https://console.groq.com/keys\n" +
            "  2. Add it to your .env file: GROQ_API_KEY=gsk_your_key_here"
        );
    }
    return new Groq({ apiKey });
}

/**
 * Determine if the query is asking about high-level project architecture, circular dependencies, dead code, or metrics.
 *
 * @param {string} query
 * @returns {boolean}
 */
function isArchitectureQuery(query) {
    const keywords = [
        "architecture", "structure", "circular", "dead file", "complexity", 
        "hotspot", "metric", "statistic", "overview", "fan-in", "fan-out", 
        "coupling", "dependency graph", "dead code"
    ];
    const lower = query.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
}

/**
 * Load global project architecture summary from ARCHITECTURE.md if available.
 *
 * @param {string} outputDir
 * @returns {Promise<string>}
 */
async function getArchitectureContext(outputDir) {
    try {
        const archPath = path.join(outputDir, "ARCHITECTURE.md");
        if (await fs.pathExists(archPath)) {
            return await fs.readFile(archPath, "utf8");
        }
    } catch (err) {
        // ignore
    }
    return "";
}

/**
 * Retrieve related data flow edges from dependencies.mermaid based on retrieved search results.
 *
 * @param {Array<{ score: number, chunk: Object }>} searchResults
 * @param {string} outputDir
 * @returns {Promise<string>}
 */
async function getDataFlowContext(searchResults, outputDir) {
    if (!searchResults || searchResults.length === 0) return "";

    try {
        const mermaidPath = path.join(outputDir, "dependencies.mermaid");
        if (await fs.pathExists(mermaidPath)) {
            const mermaidContent = await fs.readFile(mermaidPath, "utf8");
            const lines = mermaidContent.split(/\r?\n/);

            // Gather cleaned path names for retrieved files
            const cleanedPaths = [...new Set(searchResults.map(res => {
                const fp = res.chunk.filePath;
                return fp.replace(/[^a-zA-Z0-9]/g, "_");
            }))];

            // Extract edge lines containing any of the cleaned paths
            const matchedEdges = [];
            lines.forEach(line => {
                if (line.includes("-->")) {
                    const matches = cleanedPaths.some(cp => line.includes(cp));
                    if (matches) {
                        matchedEdges.push(line.trim());
                    }
                }
            });

            if (matchedEdges.length > 0) {
                return matchedEdges.join("\n");
            }
        }
    } catch (err) {
        // ignore
    }
    return "";
}

/**
 * Build a RAG context prompt from retrieved code chunks, global architecture context, and data flow.
 *
 * @param {string} query
 * @param {Array<{ score: number, chunk: Object }>} searchResults
 * @param {string} [architectureContext=""]
 * @param {string} [dataFlowContext=""]
 * @returns {string}
 */
export function buildRAGPrompt(query, searchResults, architectureContext = "", dataFlowContext = "") {
    const lines = [
        `You are AutoDocs AI, the lead repository intelligence assistant.`,
        `Your task is to answer user questions about this codebase accurately, using the retrieved code context and global context below.`,
        `Rules:`,
        `1. Rely primarily on the provided Code Context, Global Architecture, and Data Flow details.`,
        `2. Always reference file paths and line ranges (e.g. \`src/core/DependencyGraph.js:L4-L54\`) when explaining code.`,
        `3. Provide clear, concise, professional code explanations and refactoring suggestions when asked.`,
        ``
    ];

    if (architectureContext) {
        lines.push(`--- GLOBAL ARCHITECTURE & METRICS ---`);
        lines.push(architectureContext);
        lines.push(`--- END GLOBAL ARCHITECTURE ---`, ``);
    }

    if (dataFlowContext) {
        lines.push(`--- RELATED DATA FLOW & DEPENDENCIES ---`);
        lines.push(dataFlowContext);
        lines.push(`--- END RELATED DATA FLOW ---`, ``);
    }

    lines.push(`--- RETRIEVED CODE CONTEXT ---`);
    if (!searchResults || searchResults.length === 0) {
        lines.push(`(No specific code chunks were retrieved for this query.)`);
    } else {
        searchResults.forEach((res, index) => {
            const chunk = res.chunk;
            const locStr = chunk.loc ? ` (Lines L${chunk.loc.start.line}-L${chunk.loc.end.line})` : "";
            lines.push(`[Chunk ${index + 1}] ${chunk.type.toUpperCase()}: ${chunk.filePath}${locStr}`);
            lines.push(`Content:\n${chunk.content}`);
            lines.push(`---`);
        });
    }
    lines.push(`--- END RETRIEVED CONTEXT ---`);

    lines.push(`\nUser Question: ${query}`);

    return lines.join("\n");
}

/**
 * Perform a single-shot RAG Q&A query against the repository knowledge store.
 *
 * @param {string} query
 * @param {string} outputDir
 * @returns {Promise<string>}
 */
export async function askRepository(query, outputDir = "output") {
    const groq = createGroqClient();

    console.log(chalk.blue(`🔍 Retrieving repository context for query: "${query}"...`));
    const searchResults = await searchRepository(query, outputDir, 5);

    if (searchResults.length > 0) {
        console.log(chalk.dim(`  Found ${searchResults.length} relevant code chunks in knowledge store.`));
    } else {
        console.log(chalk.yellow(`  No direct vector matches found. Proceeding with general model knowledge.`));
    }

    let archContext = "";
    if (isArchitectureQuery(query)) {
        console.log(chalk.dim(`  Query matches architecture patterns. Appending ARCHITECTURE.md report context...`));
        archContext = await getArchitectureContext(outputDir);
    }

    const flowContext = await getDataFlowContext(searchResults, outputDir);
    if (flowContext) {
        console.log(chalk.dim(`  Extracted matching dependency flows from dependencies.mermaid.\n`));
    } else {
        console.log();
    }

    const prompt = buildRAGPrompt(query, searchResults, archContext, flowContext);

    console.log(chalk.cyan("🤖 AutoDocs AI is thinking...\n"));

    const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        temperature: 0.2,
    });

    const answer = completion.choices[0]?.message?.content?.trim() || "No response generated.";

    console.log(chalk.green("--- Repository Assistant Response ---"));
    console.log(answer);
    console.log(chalk.green("------------------------------------\n"));

    return answer;
}

/**
 * Start an interactive terminal REPL chat session.
 *
 * @param {string} outputDir
 * @returns {Promise<void>}
 */
export async function startInteractiveChat(outputDir = "output") {
    const groq = createGroqClient();

    console.log(chalk.bold.cyan("\n======================================================="));
    console.log(chalk.bold.cyan(" 🤖 Welcome to AutoDocs Repository Intelligence Chat"));
    console.log(chalk.dim(" Type your questions about architecture, functions, files, or flow."));
    console.log(chalk.dim(" Type 'exit', 'quit', or 'q' to end the session."));
    console.log(chalk.bold.cyan("=======================================================\n"));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.bold.green("AutoDocs > ")
    });

    const conversationHistory = [
        {
            role: "system",
            content: "You are AutoDocs AI, an expert software architect and assistant for this repository. Answer accurately using retrieved code context and reference file locations."
        }
    ];

    rl.prompt();

    rl.on("line", async (line) => {
        const input = line.trim();

        if (!input) {
            rl.prompt();
            return;
        }

        if (["exit", "quit", "q"].includes(input.toLowerCase())) {
            console.log(chalk.yellow("\nEnding chat session. Goodbye!\n"));
            rl.close();
            return;
        }

        try {
            console.log(chalk.dim(`\n  Searching knowledge store...`));
            const searchResults = await searchRepository(input, outputDir, 4);

            let archContext = "";
            if (isArchitectureQuery(input)) {
                archContext = await getArchitectureContext(outputDir);
            }
            const flowContext = await getDataFlowContext(searchResults, outputDir);

            const ragPrompt = buildRAGPrompt(input, searchResults, archContext, flowContext);

            conversationHistory.push({ role: "user", content: ragPrompt });

            process.stdout.write(chalk.cyan("  Thinking..."));
            const completion = await groq.chat.completions.create({
                model: GROQ_MODEL,
                messages: conversationHistory,
                max_tokens: 1024,
                temperature: 0.3,
            });

            const reply = completion.choices[0]?.message?.content?.trim() || "No response generated.";

            // Keep history manageable (system prompt + last 6 messages)
            conversationHistory.push({ role: "assistant", content: reply });
            if (conversationHistory.length > 7) {
                conversationHistory.splice(1, conversationHistory.length - 7);
            }

            process.stdout.write("\r" + " ".repeat(20) + "\r"); // Clear 'Thinking...'
            console.log(chalk.green("\n🤖 Assistant:"));
            console.log(reply + "\n");
        } catch (err) {
            console.error(chalk.red(`\n  Error: ${err.message}\n`));
        }

        rl.prompt();
    });
}
