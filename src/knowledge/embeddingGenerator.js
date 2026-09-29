import crypto from 'crypto';

export const VECTOR_DIMENSION = 768;

const cache = new Map();

function normalize(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude ? vector.map(val => val / magnitude) : vector;
}

export async function generateEmbedding(text, retries = 3, taskType = 'RETRIEVAL_DOCUMENT') {
    const key = crypto.createHash('sha256').update(text + taskType).digest('hex');
    if (cache.has(key)) return cache.get(key);

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_API_KEY is not set in your .env file');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'models/gemini-embedding-001',
                    content: {
                        parts: [{ text }]
                    },
                    taskType,
                    outputDimensionality: VECTOR_DIMENSION
                })
            });

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`${response.status} ${body}`);
            }

            const data = await response.json();
            const embedding = normalize(data.embedding.values);
            cache.set(key, embedding);
            return embedding;

        } catch (err) {
            const is429 = err.message?.includes('429') || err.message?.includes('quota');
            if (is429 && attempt < retries) {
                const wait = attempt * 10000;
                console.warn(`\nRate limited, retrying in ${wait / 1000}s... (attempt ${attempt}/${retries})`);
                await new Promise(r => setTimeout(r, wait));
            } else {
                console.warn(`\nWarning: Failed to generate embedding - ${err.message}`);
                return new Array(VECTOR_DIMENSION).fill(0);
            }
        }
    }
}

export function calculateCosineSimilarity(vecA, vecB) {
    const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return magA && magB ? dot / (magA * magB) : 0;
}