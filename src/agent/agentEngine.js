import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { createGroqClient, GROQ_MODEL } from "../core/groqClient.js";

async function getArchitectureContext(outputDir) {
    try {
        const archPath = path.join(process.cwd(), outputDir, "ARCHITECTURE.md");
        if (await fs.pathExists(archPath)) {
            return await fs.readFile(archPath, "utf8");
        }
    } catch (err) {
        // ignore
    }
    return "";
}

async function getDependencyGraphContext(outputDir) {
    try {
        const mermaidPath = path.join(process.cwd(), outputDir, "dependencies.mermaid");
        if (await fs.pathExists(mermaidPath)) {
            return await fs.readFile(mermaidPath, "utf8");
        }
    } catch (err) {
        // ignore
    }
    return "";
}

async function getTargetFileContext(targetFile) {
    if (!targetFile) return "";
    try {
        const resolvedPath = path.resolve(process.cwd(), targetFile);
        if (await fs.pathExists(resolvedPath)) {
            const content = await fs.readFile(resolvedPath, "utf8");
            return `File: ${targetFile}\n\n\`\`\`\n${content}\n\`\`\``;
        }
    } catch (err) {
        // ignore
    }
    return "";
}

/**
 * Executes a specific engineering task utilizing AI context.
 *
 * @param {string} taskType - Task to perform (e.g., refactor, test, readme, review, impact, quality)
 * @param {string|null} targetFile - Path to the specific file for file-scoped tasks
 * @param {string} outputDir - Output directory containing knowledge store
 * @returns {Promise<string>}
 */
export async function executeAgentTask(taskType, targetFile = null, outputDir = "output") {
    const groq = createGroqClient();

    console.log(chalk.blue(`🤖 Engineering Agent analyzing task: [${taskType}]...`));

    const archContext = await getArchitectureContext(outputDir);
    const depContext = await getDependencyGraphContext(outputDir);
    const fileContext = await getTargetFileContext(targetFile);

    let systemPrompt = `You are the Faro Engineering Agent, an expert AI software architect.
Your goal is to provide deep, actionable insights and generate high-quality code or reports.
Use the provided repository architecture context or file context to inform your responses.`;

    let userPrompt = "";

    switch (taskType) {
        case "refactor":
            if (!fileContext) throw new Error("A valid targetFile is required for 'refactor' task.");
            userPrompt = `Please analyze the following file and provide concrete refactoring suggestions to improve readability, performance, or architecture:\n\n${fileContext}`;
            break;
        case "test":
            if (!fileContext) throw new Error("A valid targetFile is required for 'test' task.");
            userPrompt = `Please generate comprehensive Jest unit tests for the following file. Focus on edge cases and core logic:\n\n${fileContext}`;
            break;
        case "readme":
            userPrompt = `Based on the following global architecture and metrics, write a comprehensive, professional project README.md file. Include a project overview, architecture summary, and key statistics.\n\n${archContext}`;
            break;
        case "review":
            userPrompt = `Please perform a deep architectural review of the project based on the following architecture report. Identify potential bottlenecks, technical debt, and areas for improvement:\n\n${archContext}`;
            break;
        case "impact":
            if (!targetFile) throw new Error("A targetFile is required for 'impact' task.");
            userPrompt = `I am planning to modify the file '${targetFile}'. Based on the project architecture and the dependency graph edges provided below, please analyze the potential impact of this change on the rest of the codebase (e.g., which modules might break or require updates).\n\nArchitecture context:\n${archContext}\n\nDependency edges:\n${depContext}`;
            break;
        case "quality":
            userPrompt = `Based on the following architecture report and metrics, write a code quality report for the repository. Highlight coupling issues, circular dependencies, or overly complex components:\n\n${archContext}`;
            break;
        default:
            throw new Error(`Unknown task type: '${taskType}'. Supported tasks: refactor, test, readme, review, impact, quality.`);
    }

    console.log(chalk.cyan("Thinking...\n"));

    const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        max_tokens: 2048,
        temperature: 0.2,
    });

    const answer = completion.choices[0]?.message?.content?.trim() || "No response generated.";

    console.log(chalk.green(`\n--- Agent Task Result: ${taskType.toUpperCase()} ---`));
    console.log(answer);
    console.log(chalk.green("---------------------------------------------------\n"));

    return answer;
}
