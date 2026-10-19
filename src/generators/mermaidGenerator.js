import fs from "fs-extra";
import path from "path";

const GROUP_PALETTE = [
    "#58a6ff",
    "#f0883e",
    "#3fb950",
    "#d2a8ff",
    "#f778ba",
    "#a5d6ff",
    "#ff7b72",
    "#e3b341",
];

const normalizePath = (filePath) => filePath.replace(/\\/g, "/");

function getFileLabel(filePath) {
    return path.basename(filePath).replace(/\.(?:jsx?|tsx?)$/i, "");
}

function getFileGroup(filePath) {
    const parts = normalizePath(filePath).split("/").filter(Boolean);
    if (parts.length <= 1) return "root";
    if (parts[0].toLowerCase() === "src" && parts.length > 2) return parts[1];
    return parts[0];
}

function serializeForInlineScript(value) {
    return JSON.stringify(value)
        .replace(/&/g, "\\u0026")
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e");
}

function buildDependencyData(projectModel, dependencyGraph) {
    const filesByNormalizedPath = new Map(
        projectModel.files.map(file => [normalizePath(file.path), file])
    );
    const fanIn = new Map([...filesByNormalizedPath.keys()].map(filePath => [filePath, 0]));
    const fanOut = new Map([...filesByNormalizedPath.keys()].map(filePath => [filePath, 0]));

    const localEdges = dependencyGraph.edges()
        .map(edge => ({ source: normalizePath(edge.v), target: normalizePath(edge.w) }))
        .filter(edge => filesByNormalizedPath.has(edge.source) && filesByNormalizedPath.has(edge.target))
        .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

    for (const edge of localEdges) {
        fanOut.set(edge.source, (fanOut.get(edge.source) ?? 0) + 1);
        fanIn.set(edge.target, (fanIn.get(edge.target) ?? 0) + 1);
    }

    const groups = [...new Set(projectModel.files.map(file => getFileGroup(file.path)))].sort();
    const groupColors = Object.fromEntries(
        groups.map((group, index) => [group, GROUP_PALETTE[index % GROUP_PALETTE.length]])
    );

    const nodes = [...projectModel.files]
        .sort((a, b) => normalizePath(a.path).localeCompare(normalizePath(b.path)))
        .map(file => {
            const normalized = normalizePath(file.path);
            const group = getFileGroup(file.path);
            return {
                data: {
                    id: file.path,
                    label: getFileLabel(file.path),
                    fullPath: file.path,
                    group,
                    color: groupColors[group],
                    fanIn: fanIn.get(normalized) ?? 0,
                    fanOut: fanOut.get(normalized) ?? 0,
                },
            };
        });

    const edges = localEdges.map((edge, index) => ({
        data: {
            id: `edge-${index}`,
            source: filesByNormalizedPath.get(edge.source).path,
            target: filesByNormalizedPath.get(edge.target).path,
        },
    }));

    return { nodes, edges, groupColors };
}

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
    })[character]);
}

function buildDependencyHtml(projectModel, dependencyGraph) {
    const graphData = buildDependencyData(projectModel, dependencyGraph);
    const title = `${projectModel.projectName || "Project"} dependency graph`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        * { box-sizing: border-box; }
        html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #0d1117; color: #f0f6fc; }
        #cy { position: absolute; inset: 0; background: #0d1117; }
        .overlay { position: absolute; z-index: 10; border: 1px solid #30363d; background: rgba(13, 17, 23, 0.94); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35); backdrop-filter: blur(8px); }
        #controls { top: 16px; left: 16px; width: min(320px, calc(100vw - 32px)); padding: 14px; border-radius: 10px; }
        #controls h1 { margin: 0 0 12px; font-size: 15px; font-weight: 650; }
        .control-row { display: flex; gap: 8px; margin-bottom: 10px; }
        button, input { border: 1px solid #30363d; border-radius: 6px; background: #161b22; color: #f0f6fc; font: inherit; }
        button { padding: 7px 10px; cursor: pointer; }
        button:hover, button:focus-visible { border-color: #58a6ff; outline: none; }
        input { width: 100%; padding: 8px 10px; outline: none; }
        input:focus { border-color: #58a6ff; box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.18); }
        #legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; margin-top: 12px; max-height: 180px; overflow: auto; font-size: 12px; color: #c9d1d9; }
        .legend-item { display: flex; align-items: center; gap: 7px; min-width: 0; }
        .legend-swatch { width: 10px; height: 10px; flex: 0 0 auto; border-radius: 3px; }
        .legend-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #tooltip { position: fixed; z-index: 30; display: none; max-width: 360px; padding: 8px 10px; border: 1px solid #30363d; border-radius: 6px; background: #161b22; color: #f0f6fc; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45); pointer-events: none; white-space: pre-line; font-size: 12px; line-height: 1.45; }
        #warning { top: 18px; left: 50%; transform: translateX(-50%); display: none; padding: 9px 14px; border-radius: 7px; color: #e3b341; font-size: 13px; }
        #info-panel { position: absolute; z-index: 20; top: 0; right: 0; width: min(390px, 92vw); height: 100%; padding: 22px; overflow: auto; border-left: 1px solid #30363d; background: #0d1117; box-shadow: -18px 0 44px rgba(0, 0, 0, 0.4); transform: translateX(105%); transition: transform 220ms ease; }
        #info-panel.open { transform: translateX(0); }
        #close-info { float: right; padding: 5px 9px; }
        #info-path { margin: 42px 0 18px; overflow-wrap: anywhere; font-size: 18px; line-height: 1.35; }
        .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 22px; }
        .metric { padding: 12px; border: 1px solid #30363d; border-radius: 8px; background: #161b22; }
        .metric strong { display: block; margin-bottom: 3px; color: #58a6ff; font-size: 22px; }
        .metric span { color: #8b949e; font-size: 12px; }
        #info-panel h3 { margin: 20px 0 8px; font-size: 13px; color: #c9d1d9; text-transform: uppercase; letter-spacing: 0.06em; }
        .node-list { display: grid; gap: 6px; }
        .node-link { width: 100%; padding: 8px 10px; overflow-wrap: anywhere; text-align: left; color: #a5d6ff; }
        .empty-list { margin: 0; color: #8b949e; font-size: 13px; }
        @media (max-width: 700px) { #controls { width: 250px; } #legend { grid-template-columns: 1fr; max-height: 100px; } }
    </style>
</head>
<body>
    <div id="cy" role="application" aria-label="Interactive repository dependency graph"></div>
    <section id="controls" class="overlay" aria-label="Graph controls">
        <h1>Dependency graph</h1>
        <div class="control-row">
            <button id="fit-graph" type="button">Fit graph</button>
            <button id="reset-graph" type="button">Reset</button>
        </div>
        <input id="node-search" type="search" placeholder="Search by filename…" aria-label="Search graph nodes by filename">
        <div id="legend" aria-label="Folder color legend"></div>
    </section>
    <div id="warning" class="overlay" role="status">No import relationships detected</div>
    <div id="tooltip" role="tooltip"></div>
    <aside id="info-panel" aria-hidden="true">
        <button id="close-info" type="button" aria-label="Close file details">Close</button>
        <h2 id="info-path"></h2>
        <div class="metrics">
            <div class="metric"><strong id="fan-out">0</strong><span>Imports</span></div>
            <div class="metric"><strong id="fan-in">0</strong><span>Imported by</span></div>
        </div>
        <h3>Direct dependencies</h3>
        <div id="dependencies" class="node-list"></div>
        <h3>Files depending on this file</h3>
        <div id="dependants" class="node-list"></div>
    </aside>

    <script id="faro-graph-data" type="application/json">${serializeForInlineScript(graphData)}</script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.28.1/cytoscape.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.min.js"></script>
    <script>
        (function () {
            "use strict";

            var graphData = JSON.parse(document.getElementById("faro-graph-data").textContent);
            cytoscape.use(cytoscapeDagre);

            var cy = cytoscape({
                container: document.getElementById("cy"),
                elements: graphData.nodes.concat(graphData.edges),
                minZoom: 0.08,
                maxZoom: 3,
                wheelSensitivity: 0.18,
                style: [
                    {
                        selector: "node",
                        style: {
                            "shape": "round-rectangle",
                            "width": "label",
                            "height": 34,
                            "padding": "12px",
                            "background-color": "#1c2333",
                            "border-width": 2,
                            "border-color": "data(color)",
                            "label": "data(label)",
                            "color": "#ffffff",
                            "font-size": 12,
                            "font-weight": 550,
                            "text-valign": "center",
                            "text-halign": "center",
                            "text-max-width": 150,
                            "text-wrap": "ellipsis",
                            "transition-property": "background-color, border-color, opacity",
                            "transition-duration": "160ms"
                        }
                    },
                    {
                        selector: "edge",
                        style: {
                            "width": 1.6,
                            "line-color": "#30363d",
                            "target-arrow-color": "#30363d",
                            "target-arrow-shape": "triangle",
                            "arrow-scale": 0.8,
                            "curve-style": "bezier",
                            "opacity": 0.9,
                            "transition-property": "line-color, target-arrow-color, opacity",
                            "transition-duration": "160ms"
                        }
                    },
                    { selector: "node.focused", style: { "background-color": "#58a6ff", "border-color": "#a5d6ff", "color": "#0d1117", "z-index": 20 } },
                    { selector: "node.neighbor", style: { "background-color": "#f0883e", "border-color": "#ffa657", "color": "#0d1117", "z-index": 15 } },
                    { selector: "edge.neighbor", style: { "line-color": "#f0883e", "target-arrow-color": "#f0883e", "width": 3, "opacity": 1, "z-index": 12 } },
                    { selector: ".faded", style: { "opacity": 0.2 } },
                    { selector: ".search-faded", style: { "opacity": 0.2 } }
                ],
                layout: {
                    name: "dagre",
                    rankDir: "LR",
                    nodeSep: 40,
                    rankSep: 120,
                    edgeSep: 10,
                    animate: true,
                    animationDuration: 400,
                    padding: 80
                }
            });

            var selectedNode = null;
            var searchInput = document.getElementById("node-search");
            var tooltip = document.getElementById("tooltip");
            var infoPanel = document.getElementById("info-panel");

            function sortedNodes(collection) {
                return collection.toArray().sort(function (a, b) {
                    return a.data("fullPath").localeCompare(b.data("fullPath"));
                });
            }

            function updateVisualState() {
                cy.elements().removeClass("focused neighbor faded search-faded");

                if (selectedNode && !selectedNode.removed()) {
                    var neighbourNodes = selectedNode.neighborhood("node");
                    var connectedEdges = selectedNode.connectedEdges();
                    selectedNode.addClass("focused");
                    neighbourNodes.addClass("neighbor");
                    connectedEdges.addClass("neighbor");
                    cy.nodes().difference(neighbourNodes.union(selectedNode)).addClass("faded");
                    cy.edges().difference(connectedEdges).addClass("faded");
                }

                var query = searchInput.value.trim().toLowerCase();
                if (query) {
                    cy.nodes().forEach(function (node) {
                        if (!node.data("label").toLowerCase().includes(query)) node.addClass("search-faded");
                    });
                    cy.edges().forEach(function (edge) {
                        if (edge.source().hasClass("search-faded") || edge.target().hasClass("search-faded")) edge.addClass("search-faded");
                    });
                }
            }

            function renderNodeList(container, nodes, emptyText) {
                container.replaceChildren();
                if (!nodes.length) {
                    var empty = document.createElement("p");
                    empty.className = "empty-list";
                    empty.textContent = emptyText;
                    container.appendChild(empty);
                    return;
                }
                nodes.forEach(function (node) {
                    var button = document.createElement("button");
                    button.type = "button";
                    button.className = "node-link";
                    button.textContent = node.data("fullPath");
                    button.addEventListener("click", function () { focusNode(node); });
                    container.appendChild(button);
                });
            }

            function showNodeInfo(node) {
                document.getElementById("info-path").textContent = node.data("fullPath");
                document.getElementById("fan-out").textContent = node.data("fanOut");
                document.getElementById("fan-in").textContent = node.data("fanIn");
                renderNodeList(document.getElementById("dependencies"), sortedNodes(node.outgoers("node")), "No direct dependencies");
                renderNodeList(document.getElementById("dependants"), sortedNodes(node.incomers("node")), "No files depend on this file");
                infoPanel.classList.add("open");
                infoPanel.setAttribute("aria-hidden", "false");
            }

            function focusNode(node) {
                selectedNode = node;
                updateVisualState();
                showNodeInfo(node);
                cy.animate({ center: { eles: node }, duration: 300 });
            }

            function resetGraph() {
                selectedNode = null;
                searchInput.value = "";
                cy.elements().removeClass("focused neighbor faded search-faded");
                infoPanel.classList.remove("open");
                infoPanel.setAttribute("aria-hidden", "true");
                tooltip.style.display = "none";
            }

            cy.on("tap", "node", function (event) { focusNode(event.target); });
            cy.on("mouseover", "node", function (event) {
                var node = event.target;
                tooltip.textContent = node.data("fullPath") + "\\nFan-in: " + node.data("fanIn") + " · Fan-out: " + node.data("fanOut");
                tooltip.style.display = "block";
            });
            cy.on("mousemove", "node", function (event) {
                var position = event.renderedPosition;
                tooltip.style.left = Math.min(position.x + 16, window.innerWidth - tooltip.offsetWidth - 12) + "px";
                tooltip.style.top = Math.min(position.y + 16, window.innerHeight - tooltip.offsetHeight - 12) + "px";
            });
            cy.on("mouseout", "node", function () { tooltip.style.display = "none"; });

            searchInput.addEventListener("input", updateVisualState);
            document.getElementById("fit-graph").addEventListener("click", function () { cy.fit(undefined, 50); });
            document.getElementById("reset-graph").addEventListener("click", resetGraph);
            document.getElementById("close-info").addEventListener("click", function () {
                infoPanel.classList.remove("open");
                infoPanel.setAttribute("aria-hidden", "true");
            });

            Object.entries(graphData.groupColors).forEach(function (entry) {
                var item = document.createElement("div");
                var swatch = document.createElement("span");
                var label = document.createElement("span");
                item.className = "legend-item";
                swatch.className = "legend-swatch";
                swatch.style.backgroundColor = entry[1];
                label.className = "legend-label";
                label.textContent = entry[0];
                item.append(swatch, label);
                document.getElementById("legend").appendChild(item);
            });

            if (graphData.edges.length === 0) document.getElementById("warning").style.display = "block";
            window.addEventListener("resize", function () { cy.resize(); });
        }());
    </script>
</body>
</html>
`;
}

export async function generateMermaidDiagrams(projectModel, dependencyGraph, outputDir) {
    const dependencyHtml = buildDependencyHtml(projectModel, dependencyGraph);
    await fs.outputFile(path.join(outputDir, "dependencies.html"), dependencyHtml);
    await fs.remove(path.join(outputDir, "dependencies.mermaid"));

    // Keep the existing class Mermaid generation unchanged.
    let classMermaid = "classDiagram\n";
    const sortedFiles = [...projectModel.files].sort((a, b) => a.path.localeCompare(b.path));
    
    sortedFiles.forEach(file => {
        const sortedClasses = [...file.classes].sort((a, b) => a.name.localeCompare(b.name));
        sortedClasses.forEach(cls => {
            const cleanClassName = cls.name.replace(/[^a-zA-Z0-9]/g, "_");
            classMermaid += `    class ${cleanClassName} {\n`;
            
            const sortedProps = [...cls.properties].sort();
            sortedProps.forEach(prop => {
                classMermaid += `        +${prop}\n`;
            });
            
            const sortedMethods = [...cls.methods].sort((a, b) => a.name.localeCompare(b.name));
            sortedMethods.forEach(method => {
                classMermaid += `        +${method.name}()\n`;
            });

            classMermaid += `    }\n`;

            if (cls.superClass) {
                const cleanSuperClass = cls.superClass.replace(/[^a-zA-Z0-9]/g, "_");
                classMermaid += `    ${cleanSuperClass} <|-- ${cleanClassName}\n`;
            }
        });
    });
    
    await fs.outputFile(path.join(outputDir, "classes.mermaid"), classMermaid);
}
