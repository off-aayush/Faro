import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatGroq } from "@langchain/groq";
import { buildFaroRetriever } from "../knowledge/langchainRetriever.js";
import { VectorStore } from "../knowledge/vectorStore.js";
import { GROQ_MODEL } from "../core/groqClient.js";

// LangSmith tracing can be enabled by setting these environment variables:
// LANGCHAIN_TRACING_V2=true
// LANGCHAIN_API_KEY=ls__your_key_here
// LANGCHAIN_PROJECT=faro
// Sign up at https://smith.langchain.com

import { isArchitectureQuery, getArchitectureContext, getDataFlowContext } from "./contextHelpers.js";

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

/** Build the existing LCEL retrieval and answer chain. */
export async function buildRAGChain(outputDir = "output") {
    const store = new VectorStore();
    if (!(await store.load(outputDir))) throw new Error("Qdrant collection missing; run generate or reindex first.");
    const retriever = buildFaroRetriever({ topK: 5, collectionName: store.collectionName });
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
        new MessagesPlaceholder("history"),
        HumanMessagePromptTemplate.fromTemplate(humanMessageTemplate.trim())
    ]);

    const chain = RunnableSequence.from([
        {
            question: input => input.question,
            history: input => input.history,
            docs: input => retriever.invoke(input.question)
        },
        {
            question: (input) => input.question,
            history: (input) => input.history,
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

/** Stream an answer with prior user and assistant turns as prompt messages. */
export async function streamRAGAnswer(question, outputDir = "output", history = []) {
    const chain = await buildRAGChain(outputDir);
    const messages = history.filter(turn => turn.role === "user" || turn.role === "assistant")
        .map(turn => [turn.role === "user" ? "human" : "ai", turn.content]);
    return await chain.stream({ question, history: messages });
}
