import crypto from "crypto";
import chalk from "chalk";
import { getVoyageClient } from "../core/voyageClient.js";

/**
 * Dimension size of the embedding vectors from voyage-code-3.
 */
export const VECTOR_DIMENSION = 1024;

const embeddingCache = new Map();

/**
 * Generate a dense vector embedding for a given text or code snippet using Voyage AI.
 * 
 * @param {string} text
 * @returns {Promise<number[]>} - Vector of size `VECTOR_DIMENSION`
 */
export async function generateEmbedding(text) {
    if (!text || text.trim() === "") {
        return new Array(VECTOR_DIMENSION).fill(0);
    }

    const hash = crypto.createHash("sha256").update(text).digest("hex");
    if (embeddingCache.has(hash)) {
        return embeddingCache.get(hash);
    }

    try {
        const client = getVoyageClient();
        const response = await client.embed({
            input: [text],
            model: "voyage-code-3"
        });

        const vector = response.data[0].embedding;
        embeddingCache.set(hash, vector);
        return vector;
    } catch (error) {
        console.warn(chalk.yellow(`\nWarning: Failed to generate embedding - ${error.message}`));
        return new Array(VECTOR_DIMENSION).fill(0);
    }
}

/**
 * Calculate Cosine Similarity between two vectors.
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} - Similarity score between 0.0 and 1.0
 */
export function calculateCosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    
    return Math.max(0, Math.min(1, similarity));
}
