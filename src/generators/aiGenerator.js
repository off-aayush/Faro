import Groq from "groq-sdk";
import chalk from "chalk";
import path from "path";

// ─────────────────────────────────────────────────────────────
//  Groq model to use — openai/gpt-oss-20b is free-tier
//  friendly: fast, zero cost, 14,400 req/day, 6,000 req/min
// ─────────────────────────────────────────────────────────────
const GROQ_MODEL = "openai/gpt-oss-20b";

// ─────────────────────────────────────────────────────────────
//  Initialise the Groq client — reads GROQ_API_KEY from env
// ─────────────────────────────────────────────────────────────
function createClient() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
        throw new Error(
            "GROQ_API_KEY is not set.\n" +
            "  1. Get a free key (no credit card) at https://console.groq.com/keys\n" +
            "  2. Add it to your .env file:\n" +
            "     GROQ_API_KEY=gsk_your_key_here"
        );
    }
    return new Groq({ apiKey });
}

// ─────────────────────────────────────────────────────────────
//  Build a compact, token-efficient prompt for a single file
// ─────────────────────────────────────────────────────────────
function buildPrompt(fileModel) {
    const lines = [
        `You are a senior technical documentation writer.`,
        `Given the metadata below extracted from a JavaScript file, write a concise (3–5 sentence) ` +
        `plain-English description of what this file does, what its key exports/functions/classes are for, ` +
        `and any notable architectural patterns (e.g. React components, Express routes).`,
        `Write flowing, readable prose. Do NOT restate the raw data as a list.`,
        ``,
        `--- FILE METADATA ---`,
        `File: ${fileModel.path}`,
    ];

    if (fileModel.exports?.length > 0) {
        lines.push(`Exports: ${fileModel.exports.map(e => `${e.name || e.source} (${e.type})`).join(", ")}`);
    }

    if (fileModel.functions?.length > 0) {
        const fnSummaries = fileModel.functions.map(f =>
            `${f.name}(${f.params?.join(", ") || ""})${f.async ? " [async]" : ""}`
        );
        lines.push(`Functions: ${fnSummaries.join(", ")}`);
    }

    if (fileModel.classes?.length > 0) {
        const clsSummaries = fileModel.classes.map(c =>
            `${c.name}${c.superClass ? ` extends ${c.superClass}` : ""} ` +
            `[methods: ${c.methods?.map(m => m.name).join(", ") || "none"}]`
        );
        lines.push(`Classes: ${clsSummaries.join("; ")}`);
    }

    if (fileModel.routes?.length > 0) {
        lines.push(`Routes: ${fileModel.routes.map(r => `${r.method.toUpperCase()} ${r.path}`).join(", ")}`);
    }

    if (fileModel.components?.length > 0) {
        const compSummaries = fileModel.components.map(c =>
            `${c.name} [props: ${c.props?.join(", ") || "none"}, hooks: ${c.hooks?.join(", ") || "none"}]`
        );
        lines.push(`React Components: ${compSummaries.join("; ")}`);
    }

    if (fileModel.imports?.length > 0) {
        const ext = fileModel.imports.filter(i => i.type === "external").map(i => i.source);
        const int = fileModel.imports.filter(i => i.type === "internal").map(i => i.source);
        if (ext.length > 0) lines.push(`External deps: ${ext.join(", ")}`);
        if (int.length > 0) lines.push(`Internal deps: ${int.join(", ")}`);
    }

    lines.push(`--- END METADATA ---`);
    return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
//  Only process files that have extractable content
// ─────────────────────────────────────────────────────────────
function hasContent(fileModel) {
    return (
        (fileModel.exports?.length > 0) ||
        (fileModel.functions?.length > 0) ||
        (fileModel.classes?.length > 0) ||
        (fileModel.routes?.length > 0) ||
        (fileModel.components?.length > 0)
    );
}

// ─────────────────────────────────────────────────────────────
//  Parse retryDelay from a 429 response (e.g. "Please retry in 5s")
// ─────────────────────────────────────────────────────────────
function parseRetryDelay(errMessage) {
    const match = errMessage.match(/Please retry in (\d+(?:\.\d+)?)s/i);
    if (match) return Math.ceil(parseFloat(match[1])) * 1000;
    return 5000; // fallback: 5 seconds
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
//  Call Groq with retry on temporary 429s (max 3 attempts)
// ─────────────────────────────────────────────────────────────
async function generateWithRetry(groq, prompt, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const completion = await groq.chat.completions.create({
                model: GROQ_MODEL,
                messages: [{ role: "user", content: prompt }],
                max_tokens: 256,
                temperature: 0.4,
            });
            return completion.choices[0]?.message?.content?.trim() ?? "";
        } catch (err) {
            const is429 = err.status === 429 || err.message?.includes("429");

            if (is429 && attempt < maxRetries) {
                const waitMs = parseRetryDelay(err.message ?? "");
                process.stdout.write(chalk.yellow(` (rate-limited, waiting ${Math.round(waitMs / 1000)}s…)`));
                await sleep(waitMs);
                continue;
            }

            throw err;
        }
    }
}

// ─────────────────────────────────────────────────────────────
//  Main export: generate AI summaries and attach to fileModels
// ─────────────────────────────────────────────────────────────
export async function generateAISummaries(projectModel) {
    const groq = createClient();

    const filesToProcess = projectModel.files.filter(hasContent);
    const total = filesToProcess.length;

    if (total === 0) {
        console.log(chalk.yellow("  No files with extractable content found — skipping AI summaries."));
        return;
    }

    console.log(chalk.blue(`  Generating AI summaries for ${total} file(s) via Groq (${GROQ_MODEL})...`));

    for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        process.stdout.write(chalk.dim(`  [${i + 1}/${total}] ${file.path}...`));

        try {
            const summary = await generateWithRetry(groq, buildPrompt(file));
            file.aiSummary = summary;
            process.stdout.write(chalk.green(" ✓\n"));
        } catch (err) {
            process.stdout.write(chalk.red(` ✗ (${err.message?.split("\n")[0]})\n`));
            file.aiSummary = null;
        }

        // Groq free tier: 30 RPM on most models → 2s gap is safe
        if (i < filesToProcess.length - 1) {
            await sleep(2000);
        }
    }
}

// ─────────────────────────────────────────────────────────────
//  Build prompt for a folder
// ─────────────────────────────────────────────────────────────
function buildFolderPrompt(folderPath, files, subdirs) {
    const lines = [
        `You are a senior technical documentation writer.`,
        `Given the directory details below, write a cohesive, high-level overview (3–5 sentences) in plain-English of what this directory does, what its role in the overall architecture is, and how its contents work together.`,
        `Write flowing, readable prose. Do NOT restate the raw data as a list.`,
        ``,
        `--- DIRECTORY METADATA ---`,
        `Directory: ${folderPath}`,
    ];

    if (subdirs && subdirs.length > 0) {
        lines.push(`Subdirectories: ${subdirs.join(", ")}`);
    }

    if (files && files.length > 0) {
        lines.push(`Files in this directory:`);
        files.forEach(f => {
            const summaryPart = f.aiSummary ? ` - Summary: ${f.aiSummary}` : "";
            lines.push(`- ${path.basename(f.path)}${summaryPart}`);
        });
    }

    lines.push(`--- END METADATA ---`);
    return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
//  Export: generate AI summary for a single folder
// ─────────────────────────────────────────────────────────────
export async function generateAIFolderSummary(folderPath, files, subdirs) {
    const groq = createClient();
    const prompt = buildFolderPrompt(folderPath, files, subdirs);
    return await generateWithRetry(groq, prompt);
}

