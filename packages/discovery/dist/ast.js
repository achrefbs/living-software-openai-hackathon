import path from "node:path";
import ts from "typescript";
const HTTP_METHODS = new Set([
    "DELETE",
    "GET",
    "HEAD",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
]);
const NATIVE_INTERACTIVE = new Set([
    "a",
    "button",
    "form",
    "input",
    "select",
    "textarea",
]);
function hasModifier(node, kind) {
    return ts.canHaveModifiers(node)
        ? (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
        : false;
}
function sourceLine(source, node) {
    return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}
function propertyName(name) {
    if (name === undefined)
        return "";
    if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name))
        return name.text;
    if (ts.isStringLiteral(name) || ts.isNumericLiteral(name))
        return name.text;
    return name.getText().slice(0, 120);
}
function expressionValue(expression) {
    if (ts.isStringLiteralLike(expression)) {
        return { value: expression.text, dynamic: false };
    }
    if (ts.isTemplateExpression(expression)) {
        let value = expression.head.text;
        for (const span of expression.templateSpans) {
            value += `{*}${span.literal.text}`;
        }
        return { value: value || "{*}", dynamic: true };
    }
    return { value: "{*}", dynamic: true };
}
function jsxAttributeValue(attribute) {
    const initializer = attribute.initializer;
    if (initializer === undefined)
        return undefined;
    if (ts.isStringLiteral(initializer)) {
        return { value: initializer.text, dynamic: false };
    }
    if (ts.isJsxExpression(initializer) &&
        initializer.expression !== undefined) {
        return expressionValue(initializer.expression);
    }
    return undefined;
}
function jsxName(tagName) {
    return tagName.getText();
}
function literalJsxAttribute(attributes, name) {
    for (const property of attributes.properties) {
        if (!ts.isJsxAttribute(property))
            continue;
        if (property.name.getText() !== name)
            continue;
        return jsxAttributeValue(property)?.value;
    }
    return undefined;
}
function hasJsxAttribute(attributes, names) {
    return attributes.properties.some((property) => ts.isJsxAttribute(property) && names.has(property.name.getText()));
}
function nearestSymbol(node) {
    let cursor = node;
    while (cursor !== undefined) {
        if ((ts.isFunctionDeclaration(cursor) || ts.isClassDeclaration(cursor)) &&
            cursor.name !== undefined) {
            return cursor.name.text;
        }
        if ((ts.isArrowFunction(cursor) || ts.isFunctionExpression(cursor)) &&
            cursor.parent !== undefined &&
            ts.isVariableDeclaration(cursor.parent) &&
            ts.isIdentifier(cursor.parent.name)) {
            return cursor.parent.name.text;
        }
        cursor = cursor.parent;
    }
    return undefined;
}
function capturesForElement(name, attributes) {
    const lower = name.toLowerCase();
    const captures = new Set(["geometry"]);
    const customInteractive = /(?:button|link|trigger|checkbox|input|select|textarea)$/iu.test(name);
    const handler = hasJsxAttribute(attributes, new Set(["onClick", "onPointerDown", "onKeyDown"]));
    const role = literalJsxAttribute(attributes, "role")?.toLowerCase();
    if (NATIVE_INTERACTIVE.has(lower) ||
        customInteractive ||
        handler ||
        role === "button" ||
        role === "link") {
        captures.add("activate");
    }
    if (lower === "input" ||
        lower === "select" ||
        lower === "textarea" ||
        /(?:input|select|textarea)$/iu.test(name) ||
        hasJsxAttribute(attributes, new Set(["onChange", "onInput"]))) {
        captures.add("change");
    }
    if (lower === "form" ||
        literalJsxAttribute(attributes, "type") === "submit" ||
        hasJsxAttribute(attributes, new Set(["onSubmit"]))) {
        captures.add("submit");
    }
    if (captures.size === 1)
        captures.add("view");
    return [...captures].sort();
}
function scriptKind(relativePath) {
    switch (path.posix.extname(relativePath).toLowerCase()) {
        case ".js":
        case ".mjs":
        case ".cjs":
            return ts.ScriptKind.JS;
        case ".jsx":
            return ts.ScriptKind.JSX;
        case ".tsx":
            return ts.ScriptKind.TSX;
        default:
            return ts.ScriptKind.TS;
    }
}
function isCodePath(relativePath) {
    return /\.(?:[cm]?js|jsx|ts|tsx)$/iu.test(relativePath);
}
export function analyzeSource(relativePath, text) {
    if (!isCodePath(relativePath))
        return undefined;
    const source = ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, scriptKind(relativePath));
    const components = [];
    const entities = [];
    const imports = [];
    const usedJsxNames = new Set();
    const locators = [];
    const storage = [];
    const links = [];
    const fetches = [];
    const endpointMethods = new Set();
    const stringConstants = new Map();
    for (const statement of source.statements) {
        if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name) &&
                    declaration.initializer !== undefined &&
                    ts.isStringLiteralLike(declaration.initializer)) {
                    stringConstants.set(declaration.name.text, declaration.initializer.text);
                }
            }
        }
    }
    function recordEntity(node) {
        if (!hasModifier(node, ts.SyntaxKind.ExportKeyword) || node.name === undefined) {
            return;
        }
        const fields = [];
        const values = [];
        let declarationKind;
        if (ts.isInterfaceDeclaration(node)) {
            declarationKind = "interface";
            fields.push(...node.members.map((member) => propertyName(member.name)).filter(Boolean));
        }
        else if (ts.isClassDeclaration(node)) {
            declarationKind = "class";
            fields.push(...node.members
                .filter((member) => ts.isPropertyDeclaration(member))
                .map((member) => propertyName(member.name))
                .filter(Boolean));
        }
        else if (ts.isEnumDeclaration(node)) {
            declarationKind = "enum";
            values.push(...node.members.map((member) => propertyName(member.name)).filter(Boolean));
        }
        else {
            declarationKind = "type";
            if (ts.isTypeLiteralNode(node.type)) {
                fields.push(...node.type.members.map((member) => propertyName(member.name)).filter(Boolean));
            }
            else if (ts.isUnionTypeNode(node.type)) {
                for (const member of node.type.types) {
                    if (ts.isLiteralTypeNode(member) &&
                        ts.isStringLiteralLike(member.literal)) {
                        values.push(member.literal.text);
                    }
                }
            }
        }
        entities.push({
            name: node.name.text,
            line: sourceLine(source, node),
            declarationKind,
            fields: [...new Set(fields)].sort(),
            values: [...new Set(values)].sort(),
        });
    }
    function visit(node) {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const clause = node.importClause;
            if (clause?.name !== undefined) {
                imports.push({
                    localName: clause.name.text,
                    importedName: "default",
                    specifier: node.moduleSpecifier.text,
                    typeOnly: clause.isTypeOnly,
                    line: sourceLine(source, node),
                });
            }
            const bindings = clause?.namedBindings;
            if (bindings !== undefined && ts.isNamedImports(bindings)) {
                for (const element of bindings.elements) {
                    imports.push({
                        localName: element.name.text,
                        importedName: element.propertyName?.text ?? element.name.text,
                        specifier: node.moduleSpecifier.text,
                        typeOnly: clause?.isTypeOnly === true || element.isTypeOnly,
                        line: sourceLine(source, element),
                    });
                }
            }
        }
        if (ts.isFunctionDeclaration(node) &&
            hasModifier(node, ts.SyntaxKind.ExportKeyword) &&
            node.name !== undefined &&
            /^[A-Z]/u.test(node.name.text)) {
            components.push({ name: node.name.text, line: sourceLine(source, node) });
        }
        if (ts.isClassDeclaration(node) &&
            hasModifier(node, ts.SyntaxKind.ExportKeyword) &&
            node.name !== undefined &&
            /^[A-Z]/u.test(node.name.text) &&
            /(?:Component|View|Page|Panel|Dialog|Card)$/u.test(node.name.text)) {
            components.push({ name: node.name.text, line: sourceLine(source, node) });
        }
        if (ts.isVariableStatement(node) &&
            hasModifier(node, ts.SyntaxKind.ExportKeyword)) {
            for (const declaration of node.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name) &&
                    /^[A-Z]/u.test(declaration.name.text) &&
                    declaration.initializer !== undefined &&
                    (ts.isArrowFunction(declaration.initializer) ||
                        ts.isFunctionExpression(declaration.initializer) ||
                        ts.isCallExpression(declaration.initializer))) {
                    components.push({
                        name: declaration.name.text,
                        line: sourceLine(source, declaration),
                    });
                }
                if (ts.isIdentifier(declaration.name) &&
                    HTTP_METHODS.has(declaration.name.text)) {
                    endpointMethods.add(declaration.name.text);
                }
            }
        }
        if (ts.isFunctionDeclaration(node) &&
            hasModifier(node, ts.SyntaxKind.ExportKeyword) &&
            node.name !== undefined &&
            HTTP_METHODS.has(node.name.text)) {
            endpointMethods.add(node.name.text);
        }
        if (ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isEnumDeclaration(node)) {
            recordEntity(node);
        }
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            const name = jsxName(node.tagName);
            usedJsxNames.add(name.split(".")[0] ?? name);
            for (const property of node.attributes.properties) {
                if (!ts.isJsxAttribute(property))
                    continue;
                const attribute = property.name.getText();
                if (attribute !== "data-testid" && attribute !== "data-living-id") {
                    continue;
                }
                const value = jsxAttributeValue(property);
                if (value === undefined || value.value.length === 0)
                    continue;
                const symbol = nearestSymbol(node);
                locators.push({
                    attribute,
                    normalizedValue: value.value.slice(0, 512),
                    dynamic: value.dynamic,
                    line: sourceLine(source, property),
                    elementName: name,
                    ...(symbol === undefined ? {} : { symbol }),
                    captures: capturesForElement(name, node.attributes),
                });
            }
            const href = literalJsxAttribute(node.attributes, "href");
            if (href?.startsWith("/") === true) {
                links.push({ target: href, line: sourceLine(source, node) });
            }
        }
        if (ts.isCallExpression(node)) {
            if (ts.isIdentifier(node.expression) && node.expression.text === "fetch") {
                const argument = node.arguments[0];
                if (argument !== undefined) {
                    const target = expressionValue(argument);
                    if (target.value.startsWith("/")) {
                        fetches.push({ target: target.value, line: sourceLine(source, node) });
                    }
                }
            }
            if (ts.isPropertyAccessExpression(node.expression) &&
                node.expression.expression.getText(source) === "localStorage") {
                const method = node.expression.name.text;
                const argument = node.arguments[0];
                const target = argument === undefined
                    ? { value: "{*}", dynamic: true }
                    : ts.isIdentifier(argument) && stringConstants.has(argument.text)
                        ? { value: stringConstants.get(argument.text) ?? "{*}", dynamic: false }
                        : expressionValue(argument);
                storage.push({
                    key: target.value,
                    dynamic: target.dynamic,
                    access: method === "getItem"
                        ? "read"
                        : method === "setItem" || method === "removeItem" || method === "clear"
                            ? "write"
                            : "read-write",
                    line: sourceLine(source, node),
                });
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    if (/\blocalStorage\b/u.test(text) && storage.length === 0) {
        const likelyKey = [...stringConstants.entries()].find(([name]) => /STORAGE.*KEY|KEY.*STORAGE/iu.test(name));
        const position = text.indexOf("localStorage");
        storage.push({
            key: likelyKey?.[1] ?? "{*}",
            dynamic: likelyKey === undefined,
            access: "read-write",
            line: source.getLineAndCharacterOfPosition(Math.max(0, position)).line + 1,
        });
    }
    return {
        path: relativePath,
        components: components
            .filter((component, index, all) => all.findIndex((candidate) => candidate.name === component.name) === index)
            .sort((left, right) => left.name.localeCompare(right.name)),
        entities: entities.sort((left, right) => left.name.localeCompare(right.name)),
        imports,
        usedJsxNames,
        locators,
        storage,
        links,
        fetches,
        endpointMethods: [...endpointMethods].sort(),
    };
}
//# sourceMappingURL=ast.js.map