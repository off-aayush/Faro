import fs from "fs-extra";
import path from "path";

/** Return whether a question needs global architecture context. */
export function isArchitectureQuery(query) {
    const keywords = ["architecture", "structure", "circular", "dead file", "complexity", "hotspot", "metric", "statistic", "overview", "fan-in", "fan-out", "coupling", "dependency graph", "dead code"];
    const lower = query.toLowerCase();
    return keywords.some(keyword => lower.includes(keyword));
}

/** Read the generated architecture report when it exists. */
export async function getArchitectureContext(outputDir) {
    try {
        const report = path.join(outputDir, "ARCHITECTURE.md");
        return await fs.pathExists(report) ? await fs.readFile(report, "utf8") : "";
    } catch {
        return "";
    }
}

async function readDependencyGraphData(outputDir) {
    const artifact = path.join(outputDir, "dependencies.html");
    if (!(await fs.pathExists(artifact))) return null;
    const html = await fs.readFile(artifact, "utf8");
    const match = html.match(/<script id="faro-graph-data" type="application\/json">([\s\S]*?)<\/script>/);
    return match ? JSON.parse(match[1]) : null;
}

/** Read all local dependency edges embedded in the interactive graph. */
export async function getDependencyGraphContext(outputDir) {
    try {
        const graph = await readDependencyGraphData(outputDir);
        return graph?.edges?.map(edge => `${edge.data.source} --> ${edge.data.target}`).join("\n") ?? "";
    } catch {
        return "";
    }
}

/** Find dependency edges related to retrieved chunks. */
export async function getDataFlowContext(searchResults, outputDir) {
    if (!searchResults?.length) return "";
    try {
        const graph = await readDependencyGraphData(outputDir);
        if (!graph?.edges) return "";
        const paths = new Set(searchResults.map(result => result.chunk.filePath.replace(/\\/g, "/")));
        return graph.edges
            .map(edge => edge.data)
            .filter(edge => paths.has(edge.source.replace(/\\/g, "/")) || paths.has(edge.target.replace(/\\/g, "/")))
            .map(edge => `${edge.source} --> ${edge.target}`)
            .join("\n");
    } catch {
        return "";
    }
}

/** Build the legacy plain-text RAG prompt from retrieved context. */
export function buildRAGPrompt(query, searchResults, architectureContext = "", dataFlowContext = "") {
    const lines = ["You are Faro AI, the lead repository intelligence assistant.",
        "Answer questions accurately using the retrieved code context and global context below.",
        "Reference file paths and line ranges when explaining code."];
    if (architectureContext) lines.push("--- GLOBAL ARCHITECTURE & METRICS ---", architectureContext, "--- END GLOBAL ARCHITECTURE ---");
    if (dataFlowContext) lines.push("--- RELATED DATA FLOW & DEPENDENCIES ---", dataFlowContext, "--- END RELATED DATA FLOW ---");
    lines.push("--- RETRIEVED CODE CONTEXT ---");
    if (!searchResults?.length) lines.push("(No specific code chunks were retrieved for this query.)");
    else searchResults.forEach((result, index) => {
        const chunk = result.chunk;
        const loc = chunk.loc ? ` (Lines L${chunk.loc.start.line}-L${chunk.loc.end.line})` : "";
        lines.push(`[Chunk ${index + 1}] ${chunk.type.toUpperCase()}: ${chunk.filePath}${loc}`, `Content:\n${chunk.content}`, "---");
    });
    lines.push("--- END RETRIEVED CONTEXT ---", `\nUser Question: ${query}`);
    return lines.join("\n");
}
