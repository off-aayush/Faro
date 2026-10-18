import { glob } from "glob";
import path from "path";
import fs from "fs-extra";

/** Return supported source files under a project path. */
export async function scanProject(projectPath) {
    const absolutePath = path.resolve(projectPath);

    if (!(await fs.pathExists(absolutePath))) {
        throw new Error("Project path does not exist.");
    }

    const files = await glob("**/*.{js,jsx,ts,tsx}", {
        cwd: absolutePath,

        absolute: false,

        ignore: [
            "**/node_modules/**",
            "**/.git/**",
            "**/dist/**",
            "**/build/**",
            "**/coverage/**",
        ],
    });

    return files.sort();
}
