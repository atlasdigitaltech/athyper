import ts from "typescript";

// Inspect syntax, not strings/comments or unrelated object.require() methods.
export function sourceImports(source, filename = "source.ts") {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const values = [];
  const literal = (node) => {
    if (node && ts.isStringLiteralLike(node)) values.push(node.text);
  };
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      literal(node.moduleSpecifier);
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      literal(node.moduleReference.expression);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      literal(node.argument.literal);
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const moduleCall =
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === "require");
      const mock =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        ["vi", "jest"].includes(callee.expression.text) &&
        callee.name.text === "mock";
      if (moduleCall || mock) literal(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...new Set(values)];
}
