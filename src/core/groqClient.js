import Groq from "groq-sdk";
import "dotenv/config";

/**
 * The Groq model identifier used across all AI-powered features.
 *
 * @type {string}
 */
export const GROQ_MODEL = "llama-3.1-8b-instant";

/**
 * Initialize and return a Groq API client using the GROQ_API_KEY environment variable.
 * Throws a descriptive error if the key is missing or empty.
 *
 * This is the single shared factory for the Groq SDK used by both the Chat Engine
 * and the Engineering Agent. Import from this module instead of instantiating Groq directly.
 *
 * @returns {Groq}
 * @throws {Error} If GROQ_API_KEY is not set.
 */
export function createGroqClient() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
        throw new Error(
            "GROQ_API_KEY is not set in environment or .env file.\n" +
            "  1. Get a free key at https://console.groq.com/keys\n" +
            "  2. Add it to your .env file: GROQ_API_KEY=gsk_your_key_here"
        );
    }
    return new Groq({ apiKey });
}
