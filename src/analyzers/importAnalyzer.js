import path from "path";
import { traverseAST } from "../parser/traverse.js";

/** Record static, require, and dynamic imports with local resolution metadata. */
export function analyzeImports(fileModel, projectFiles = new Set()) {
    const files = projectFiles instanceof Set ? projectFiles : new Set(projectFiles);
    const record = (source, specifiers = [], isDynamic = false, isRequire = false) => {
        const local = source.startsWith(".");
        const entry = {
            source,
            type: isDynamic ? "dynamic" : local ? "local" : "external",
            specifiers,
            isDynamic,
            isRequire,
        };
        if (local) {
            const base = path.posix.normalize(path.posix.join(path.posix.dirname(fileModel.path.replace(/\\/g, "/")), source));
            const candidates = [base, ...[".js", ".jsx", ".ts", ".tsx"].map(ext => base + ext),
                ...[".js", ".jsx", ".ts", ".tsx"].map(ext => `${base}/index${ext}`)];
            entry.resolvedPath = candidates.find(candidate => files.has(candidate)) ?? null;
        }
        fileModel.imports.push(entry);
    };

    traverseAST(fileModel.ast, {
        ImportDeclaration(astPath) {
            const specifiers = astPath.node.specifiers.map(specifier =>
                specifier.imported?.name ?? specifier.local?.name ?? "*");
            record(astPath.node.source.value, specifiers);
        },
        CallExpression(astPath) {
            const { callee, arguments: args } = astPath.node;
            if (callee.type === "Identifier" && callee.name === "require" && args[0]?.type === "StringLiteral") {
                record(args[0].value, [], false, true);
            } else if (callee.type === "Import" && args[0]?.type === "StringLiteral") {
                record(args[0].value, [], true, false);
            }
        },
        ImportExpression(astPath) {
            if (astPath.node.source.type === "StringLiteral") record(astPath.node.source.value, [], true, false);
        },
    });
}
