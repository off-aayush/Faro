import { parse } from "@babel/parser";
import chalk from "chalk";

/**
 * Converts JavaScript source code into a Babel AST.
 *
 * @param {string} sourceCode
 * @param {string} filePath
 * @returns {import("@babel/types").File|null}
 */
export function parseFile(sourceCode, filePath = "<unknown>") {
    try {
        return parse(sourceCode, {
            sourceType: "unambiguous",
            plugins: ["jsx", "typescript", "classProperties", "dynamicImport", "optionalChaining", "importAssertions"],
        });
    } catch (error) {
        console.warn(chalk.yellow(`[PARSE ERROR] ${filePath}: ${error.message}`));
        return null;
    }
}
