import { QdrantVectorStore } from "@langchain/qdrant";
import { Embeddings } from "@langchain/core/embeddings";
import { generateEmbedding } from "./embeddingGenerator.js";
import { QdrantClient } from "@qdrant/js-client-rest";

class FaroEmbeddingsAdapter extends Embeddings {
    constructor() {
        super({});
    }

    async embedDocuments(texts) {
        return await Promise.all(
            texts.map(text => generateEmbedding(text, 3, 'RETRIEVAL_DOCUMENT'))
        );
    }

    async embedQuery(text) {
        return await generateEmbedding(text, 3, 'RETRIEVAL_QUERY');
    }
}

export function buildFaroRetriever(options = {}) {
    const url = process.env.QDRANT_URL || "http://localhost:6333";
    const client = new QdrantClient({ url });
    
    const vectorStore = new QdrantVectorStore(new FaroEmbeddingsAdapter(), {
        client,
        collectionName: options.collectionName || "faro_vectors",
    });

    return vectorStore.asRetriever({ k: options.topK ?? 5 });
}

export function buildFaroRetrieverWithFilter(filter, options = {}) {
    const url = process.env.QDRANT_URL || "http://localhost:6333";
    const client = new QdrantClient({ url });
    
    const vectorStore = new QdrantVectorStore(new FaroEmbeddingsAdapter(), {
        client,
        collectionName: options.collectionName || "faro_vectors",
    });

    return vectorStore.asRetriever({ 
        k: options.topK ?? 5,
        filter: filter 
    });
}
