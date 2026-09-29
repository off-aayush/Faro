import { BaseRetriever } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import { generateEmbedding } from "./embeddingGenerator.js";
import { QdrantClient } from "@qdrant/js-client-rest";

/**
 * Custom LangChain retriever that queries Qdrant directly and correctly maps
 * Faro's payload schema ({ chunk: {...} }) to LangChain Documents.
 *
 * @langchain/qdrant's built-in retriever expects { pageContent, metadata } in
 * the point payload, but Faro stores { chunk } — so we bypass it entirely.
 */
class FaroQdrantRetriever extends BaseRetriever {
    lc_namespace = ["faro", "retrievers"];

    constructor(options = {}) {
        super();
        const url = process.env.QDRANT_URL || "http://localhost:6333";
        this.client = new QdrantClient({ url });
        this.collectionName = options.collectionName || "faro_vectors";
        this.topK = options.topK ?? 5;
        this.filter = options.filter ?? null;
        this.minScore = options.minScore ?? 0.01;
    }

    async _getRelevantDocuments(query) {
        const queryVector = await generateEmbedding(query, 3, "RETRIEVAL_QUERY");

        const queryParams = {
            query: queryVector,
            limit: this.topK,
            score_threshold: this.minScore,
            with_payload: true,
        };
        if (this.filter) {
            queryParams.filter = this.filter;
        }

        const results = await this.client.query(this.collectionName, queryParams);

        return results.points.map((hit) => {
            const chunk = hit.payload?.chunk ?? hit.payload ?? {};
            return new Document({
                pageContent: chunk.content ?? "",
                metadata: {
                    chunk,
                    score: hit.score,
                    id: hit.id,
                },
            });
        });
    }
}

export function buildFaroRetriever(options = {}) {
    return new FaroQdrantRetriever(options);
}

export function buildFaroRetrieverWithFilter(filter, options = {}) {
    return new FaroQdrantRetriever({ ...options, filter });
}
