import { analyzeImports } from "../analyzers/importAnalyzer.js";
import { analyzeFunctions } from "../analyzers/functionAnalyzer.js";
import { analyzeExports } from "../analyzers/exportAnalyzer.js";
import { analyzeClasses } from "../analyzers/classAnalyzer.js";
import { analyzeRoutes } from "../analyzers/routeAnalyzer.js";
import { analyzeReactComponents } from "../analyzers/reactAnalyzer.js";

const analyzers = [
    analyzeImports,
    analyzeFunctions,
    analyzeExports,
    analyzeClasses,
    analyzeRoutes,
    analyzeReactComponents
];

/** Run all analyzers on a parsed file. */
export function analyze(fileModel, projectFiles = new Set()) {
    analyzers.forEach((analyzer) => analyzer(fileModel, projectFiles));
}
