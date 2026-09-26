import fs from "fs-extra";
import path from "path";
import { QdrantClient } from "@qdrant/js-client-rest";
import { VECTOR_DIMENSION } from "./embeddingGenerator.js";

/**
 * Vector Store for storing and querying code chunk embeddings using Qdrant.
 */
export class VectorStore {
    constructor(projectName = null) {
        const url = process.env.QDRANT_URL || "http://localhost:6333";
        this.client = new QdrantClient({ url });
        if (projectName) {
            this.collectionName = `faro_vectors_${projectName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()}`;
        } else {
            this.collectionName = "faro_vectors";
        }
        this.vectorSize = VECTOR_DIMENSION;
        this.pointIdCounter = 1;
        this._collectionEnsured = false;
    }

    /**
     * Ensure the Qdrant collection exists.
     */
    async ensureCollection() {
        if (this._collectionEnsured) return;
        try {
            const result = await this.client.collectionExists(this.collectionName);
            if (!result.exists) {
                await this.client.createCollection(this.collectionName, {
                    vectors: {
                        size: this.vectorSize,
                        distance: "Cosine"
                    }
                });
            }
            this._collectionEnsured = true;
        } catch (error) {
            console.error(`Failed to ensure Qdrant collection: ${error.message}`);
            throw error;
        }
    }

    /**
     * Add a chunk and its vector representation to the store.
     *
     * @param {Object} chunk
     * @param {number[]} vector
     */
    async add(chunk, vector) {
        await this.ensureCollection();
        const pointId = this.pointIdCounter++;
        await this.client.upsert(this.collectionName, {
            wait: true,
            points: [
                {
                    id: pointId,
                    vector,
                    payload: { chunk }
                }
            ]
        });
    }

    /**
     * Search the vector store for top matching chunks.
     *
     * @param {number[]} queryVector
     * @param {number} topK - Number of top results to return
     * @param {number} minScore - Minimum similarity threshold
     * @param {Object} filter - Optional filter
     * @returns {Promise<Array<{ score: number, chunk: Object }>>}
     */
    async search(queryVector, topK = 5, minScore = 0.01, filter = null) {
        try {
            const results = await this.client.search(this.collectionName, {
                vector: queryVector,
                limit: topK,
                score_threshold: minScore,
                filter
            });

            return results.map(res => ({
                score: Math.round(res.score * 10000) / 10000,
                chunk: res.payload.chunk
            }));
        } catch (error) {
            console.error(`Search failed: ${error.message}`);
            return [];
        }
    }

    /**
     * Serialize and save vector store metadata to outputDir.
     *
     * @param {string} outputDir
     * @returns {Promise<void>}
     */
    async save(outputDir) {
        const storePath = path.join(outputDir, "qdrant_meta.json");
        await fs.ensureDir(outputDir);
        
        let totalPoints = 0;
        try {
            const info = await this.client.getCollection(this.collectionName);
            totalPoints = info.points_count || 0;
        } catch (error) {
            // Collection might not exist yet
        }
        
        await fs.writeJson(storePath, {
            collectionName: this.collectionName,
            totalPoints,
            timestamp: new Date().toISOString()
        }, { spaces: 2 });
    }

    /**
     * Load vector store metadata and verify collection exists.
     *
     * @param {string} outputDir
     * @returns {Promise<boolean>} - True if loaded successfully and exists
     */
    async load(outputDir) {
        const storePath = path.join(outputDir, "qdrant_meta.json");
        if (!(await fs.pathExists(storePath))) {
            return false;
        }

        const data = await fs.readJson(storePath);
        if (data.collectionName) {
            this.collectionName = data.collectionName;
        }
        
        try {
            const result = await this.client.collectionExists(this.collectionName);
            return result.exists;
        } catch (error) {
            return false;
        }
    }
}
