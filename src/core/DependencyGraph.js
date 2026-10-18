import { Graph } from "graphlib";
import path from "path";

export function buildDependencyGraph(projectModel) {
    const graph = new Graph({ directed: true });

    const normalizeId = (id) => id.replace(/\\/g, "/");

    // Add nodes
    projectModel.files.forEach(fileModel => {
        const nodeId = normalizeId(fileModel.path);
        if (!graph.hasNode(nodeId)) {
            graph.setNode(nodeId, { label: fileModel.path });
        }
    });

    // Add edges
    projectModel.files.forEach(fileModel => {
        const sourceId = normalizeId(fileModel.path);
        
        fileModel.imports.forEach(imp => {
            // Very simple resolution for local imports
            if (imp.type === "local" || (imp.type === "dynamic" && imp.source.startsWith("."))) {
                // Prefer the analyzer's resolution, including directory index files.
                const dir = path.dirname(fileModel.path);
                
                // Use standard path.join then normalize
                let targetPath = imp.resolvedPath || path.join(dir, imp.source);
                targetPath = normalizeId(targetPath);
                
                // If it doesn't end with .js, assume .js for simplicity in this MVP
                if (!/\.(js|jsx|ts|tsx)$/.test(targetPath)) {
                    targetPath += ".js";
                }

                if (graph.hasNode(targetPath)) {
                    graph.setEdge(sourceId, targetPath);
                } else {
                    // It might be an external node that isn't mapped, or we missed it
                    graph.setNode(targetPath, { label: targetPath, external: true });
                    graph.setEdge(sourceId, targetPath);
                }
            } else {
                // External package
                if (!graph.hasNode(imp.source)) {
                    graph.setNode(imp.source, { label: imp.source, external: true });
                }
                graph.setEdge(sourceId, imp.source);
            }
        });
    });

    return graph;
}
