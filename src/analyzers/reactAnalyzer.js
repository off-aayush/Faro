import { traverseAST } from "../parser/traverse.js";

function componentName(functionPath) {
    if (functionPath.node.id?.name) return functionPath.node.id.name;
    const declarator = functionPath.findParent(parent => parent.isVariableDeclarator());
    if (declarator?.node.id.type === "Identifier") return declarator.node.id.name;
    return "AnonymousComponent";
}

function parameterProps(parameter, interfaces) {
    if (!parameter) return [];
    if (parameter.type === "ObjectPattern") return parameter.properties.map(property => property.key?.name).filter(Boolean);
    if (parameter.type !== "Identifier") return [];
    const annotation = parameter.typeAnnotation?.typeAnnotation;
    if (annotation?.type === "TSTypeLiteral") return annotation.members.map(member => member.key?.name).filter(Boolean);
    if (annotation?.type === "TSTypeReference") return interfaces.get(annotation.typeName.name) ?? [];
    return [];
}

/** Detect JSX components, including wrapped functions, and collect props and hooks. */
export function analyzeReactComponents(fileModel) {
    const components = new Map();
    const interfaces = new Map();
    const propTypes = new Map();

    traverseAST(fileModel.ast, {
        TSInterfaceDeclaration(astPath) {
            interfaces.set(astPath.node.id.name, astPath.node.body.body.map(member => member.key?.name).filter(Boolean));
        },
        AssignmentExpression(astPath) {
            const { left, right } = astPath.node;
            if (left.type === "MemberExpression" && left.property.name === "propTypes" && left.object.type === "Identifier" && right.type === "ObjectExpression") {
                propTypes.set(left.object.name, right.properties.map(property => property.key?.name).filter(Boolean));
            }
        },
    });

    const collect = (jsxPath, element) => {
        const owner = jsxPath.findParent(parent => parent.isFunction() || parent.isClass());
        if (!owner) return;
        const name = componentName(owner);
        if (!components.has(name)) {
            let props = owner.isFunction() ? parameterProps(owner.node.params[0], interfaces) : [];
            if (!props.length) props = interfaces.get(`${name}Props`) ?? [];
            components.set(name, { name, props, hooks: new Set(), jsxChildren: new Set(), path: owner });
        }
        components.get(name).jsxChildren.add(element);
    };

    traverseAST(fileModel.ast, {
        JSXElement(astPath) {
            const tag = astPath.node.openingElement.name;
            const element = tag.type === "JSXIdentifier" ? tag.name : tag.type === "JSXMemberExpression" ? `${tag.object.name}.${tag.property.name}` : "<Unknown>";
            collect(astPath, element);
        },
        JSXFragment(astPath) { collect(astPath, "<Fragment>"); },
    });

    for (const component of components.values()) {
        component.path.traverse({
            CallExpression(astPath) {
                if (astPath.node.callee.type === "Identifier" && astPath.node.callee.name.startsWith("use")) component.hooks.add(astPath.node.callee.name);
            },
        });
        fileModel.components.push({
            name: component.name,
            props: [...new Set([...component.props, ...(propTypes.get(component.name) ?? [])])],
            hooks: [...component.hooks],
            jsxChildren: [...component.jsxChildren],
            loc: component.path.node.loc,
        });
    }
}
