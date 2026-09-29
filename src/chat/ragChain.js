import fs from "fs-extra";
import path from "path";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence, RunnablePassthrough, RunnableLambda } from "@langchain/core/runnables";
import { ChatGroq } from "@langchain/groq";
import { buildFaroRetriever } from "../knowledge/langchainRetriever.js";
import { GROQ_MODEL } from "../core/groqClient.js";

// LangSmith tracing can be enabled by setting these environment variables:
// LANGCHAIN_TRACING_V2=true
// LANGCHAIN_API_KEY=ls__your_key_here
// LANGCHAIN_PROJECT=faro
// Sign up at https://smith.langchain.com

import { isArchitectureQuery, getArchitectureContext, getDataFlowContext } from "./chatEngine.js";

const systemMessage = `You are Faro AI, the lead repository intelligence assistant.
Your task is to answer user questions about this codebase accurately, using the retrieved code context and global context below.
Rules:
1. Rely primarily on the provided Code Context, Global Architecture, and Data Flow details.
2. Always reference file paths and line ranges (e.g. \`src/core/DependencyGraph.js:L4-L54\`) when explaining code.
3. Provide clear, concise, professional code explanations and refactoring suggestions when asked.`;

const humanMessageTemplate = `
{archSection}
{dataFlowSection}
--- RETRIEVED CODE CONTEXT ---
{context}
--- END RETRIEVED CONTEXT ---

User Question: {question}
`;

export async function buildRAGChain(outputDir = "output") {
    const retriever = buildFaroRetriever({ topK: 5 });
    const llm = new ChatGroq({ model: GROQ_MODEL, temperature: 0.2, maxTokens: 1024 });

    const formatContext = (docs) => {
        if (!docs || docs.length === 0) return "(No specific code chunks were retrieved for this query.)";
        return docs.map((doc, index) => {
            // Note: Qdrant vector store maps the whole point payload to doc.metadata if not strictly specified.
            const chunk = doc.metadata.chunk || doc.metadata;
            const type = (chunk.type || "unknown").toUpperCase();
            const fp = chunk.filePath || "unknown";
            const locStr = chunk.loc ? ` (Lines L${chunk.loc.start?.line}-L${chunk.loc.end?.line})` : "";
            const content = doc.pageContent || chunk.content || "";
            
            return `[Chunk ${index + 1}] ${type}: ${fp}${locStr}\nContent:\n${content}\n---`;
        }).join("\n");
    };

    const prompt = ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(systemMessage),
        HumanMessagePromptTemplate.fromTemplate(humanMessageTemplate.trim())
    ]);

    const chain = RunnableSequence.from([
        {
            question: new RunnablePassthrough(),
            docs: retriever
        },
        {
            question: (input) => input.question,
            context: (input) => formatContext(input.docs),
            archSection: async (input) => {
                if (isArchitectureQuery(input.question)) {
                    const ctx = await getArchitectureContext(outputDir);
                    return ctx ? `--- GLOBAL ARCHITECTURE & METRICS ---\n${ctx}\n--- END GLOBAL ARCHITECTURE ---\n` : "";
                }
                return "";
            },
            dataFlowSection: async (input) => {
                const searchResults = input.docs.map(doc => ({ chunk: doc.metadata.chunk || doc.metadata }));
                const ctx = await getDataFlowContext(searchResults, outputDir);
                return ctx ? `--- RELATED DATA FLOW & DEPENDENCIES ---\n${ctx}\n--- END RELATED DATA FLOW ---\n` : "";
            }
        },
        prompt,
        llm,
        new StringOutputParser()
    ]);

    return chain;
}

export async function streamRAGAnswer(question, outputDir = "output") {
    const chain = await buildRAGChain(outputDir);
    return await chain.stream(question);
}
