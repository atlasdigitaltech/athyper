import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
it("keeps trust qualification in the signing adapter without product, host or publication-decision dependencies", () => {
  const source = ts.createSourceFile("signing-domain.ts", readFileSync(new URL("../trust/signing-domain.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      expect(ts.isStringLiteral(node.moduleSpecifier)).toBe(true);
      const value = (node.moduleSpecifier as ts.StringLiteral).text;
      imports.push(value);
      if (value !== "node:crypto") expect(node.importClause?.isTypeOnly).toBe(true);
    }
    if (ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node) || ts.isExportDeclaration(node) && node.moduleSpecifier
      || ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require")) throw Error("Trust dependency bypass");
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(imports).toEqual(["node:crypto", "@athyper/server-contract-secrets", "../key-resolver.js"]);
});
