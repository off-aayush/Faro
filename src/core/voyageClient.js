import { VoyageAIClient } from "voyageai";
import "dotenv/config";

/**
 * Initialize and return a Voyage AI API client using the VOYAGE_API_KEY environment variable.
 * Throws a descriptive error if the key is missing or empty.
 *
 * @returns {VoyageAIClient}
 * @throws {Error} If VOYAGE_API_KEY is not set.
 */
export function createVoyageClient() {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
        throw new Error(
            "VOYAGE_API_KEY is not set in environment or .env file.\n" +
            "  1. Get a free key at https://dash.voyageai.com/\n" +
            "  2. Add it to your .env file: VOYAGE_API_KEY=your_key_here"
        );
    }
    return new VoyageAIClient({ apiKey });
}

let voyageClientInstance = null;

/**
 * Singleton getter for the Voyage API client.
 *
 * @returns {VoyageAIClient}
 */
export function getVoyageClient() {
    if (!voyageClientInstance) {
        voyageClientInstance = createVoyageClient();
    }
    return voyageClientInstance;
}
