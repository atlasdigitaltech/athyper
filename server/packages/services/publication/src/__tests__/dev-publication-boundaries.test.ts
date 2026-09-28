import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";

it.each([
  ["../shared/policy/classify-change.ts", ["node:crypto", "@athyper/server-contract-metadata", "@athyper/server-contract-publication"]],
  ["../../../../contracts/publication/src/policy/dev-publication-policy.ts", []],
  ["../../../../contracts/publication/src/evidence/dev-publication-decision.ts", ["../policy/dev-publication-policy.js"]],
] as const)("enforces dependency/authority boundaries: %s", (path, allowed) => {
  const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      expect(ts.isStringLiteral(node.moduleSpecifier)).toBe(true);
      imports.push((node.moduleSpecifier as ts.StringLiteral).text);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier || ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node)
      || (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require"))) throw Error("Dependency bypass");
    if (ts.isIdentifier(node)) expect(["process", "fetch", "eval", "Function"].includes(node.text)).toBe(false);
    if (ts.isStringLiteral(node)) expect(["country", "currency", "business_partner"].includes(node.text)).toBe(false);
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(imports).toEqual(allowed);
});
