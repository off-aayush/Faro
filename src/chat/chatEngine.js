import readline from "readline";
import chalk from "chalk";
import { streamRAGAnswer } from "./ragChain.js";
export { isArchitectureQuery, getArchitectureContext, getDataFlowContext, buildRAGPrompt } from "./contextHelpers.js";

/**
 * Perform a single-shot RAG Q&A query against the repository knowledge store.
 *
 * @param {string} query
 * @param {string} outputDir
 * @returns {Promise<string>}
 */
export async function askRepository(query, outputDir = "output") {
    console.log(chalk.cyan("🤖 Faro AI is thinking...\n"));
    console.log(chalk.green("--- Repository Assistant Response ---"));

    const stream = await streamRAGAnswer(query, outputDir);
    let fullAnswer = "";
    
    for await (const chunk of stream) {
        process.stdout.write(chunk);
        fullAnswer += chunk;
    }

    console.log(chalk.green("\n------------------------------------\n"));
    return fullAnswer;
}

/**
 * Start an interactive terminal REPL chat session.
 *
 * @param {string} outputDir
 * @returns {Promise<void>}
 */
export async function startInteractiveChat(outputDir = "output") {

    console.log(chalk.bold.cyan("\n======================================================="));
    console.log(chalk.bold.cyan(" 🤖 Welcome to Faro Repository Intelligence Chat"));
    console.log(chalk.dim(" Type your questions about architecture, functions, files, or flow."));
    console.log(chalk.dim(" Type 'exit', 'quit', or 'q' to end the session."));
    console.log(chalk.bold.cyan("=======================================================\n"));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.bold.green("Faro > ")
    });

    const conversationHistory = [
        {
            role: "system",
            content: "You are Faro AI, an expert software architect and assistant for this repository. Answer accurately using retrieved code context and reference file locations."
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
            process.stdout.write(chalk.cyan("  Thinking...\n"));
            const stream = await streamRAGAnswer(input, outputDir, conversationHistory);

            console.log(chalk.green("\n🤖 Assistant:"));
            let reply = "";
            for await (const chunk of stream) {
                process.stdout.write(chunk);
                reply += chunk;
            }
            console.log(chalk.green("\n"));

            // Keep history manageable (system prompt + last 6 messages)
            conversationHistory.push({ role: "user", content: input });
            conversationHistory.push({ role: "assistant", content: reply });
            if (conversationHistory.length > 7) {
                conversationHistory.splice(1, conversationHistory.length - 7);
            }
        } catch (err) {
            console.error(chalk.red(`\n  Error: ${err.message}\n`));
        }

        rl.prompt();
    });
}
