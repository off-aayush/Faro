import path from "path";
import fs from "fs-extra";

import { scanProject } from "../scanner/scanProject.js";
import { parseFile } from "../parser/parser.js";

import { ProjectModel } from "../model/ProjectModel.js";
import { FileModel } from "../model/FileModel.js";

import { analyze } from "./AnalyzerEngine.js";

/** Load, parse, and analyze supported project source files once each. */
export async function loadProject(projectPath) {
    const project = new ProjectModel(path.basename(path.resolve(projectPath)));

    const files = await scanProject(projectPath);

    for (const file of files) {
        const absolute = path.join(projectPath, file);

        const sourceCode = await fs.readFile(absolute, "utf8");

        const ast = parseFile(sourceCode, file);
        if (!ast) continue;

        const fileModel = new FileModel(file, sourceCode, ast);

        project.addFile(fileModel);
    }

    const filePaths = new Set(project.files.map(file => file.path.replace(/\\/g, "/")));
    for (const file of project.files) analyze(file, filePaths);

    return project;
}
