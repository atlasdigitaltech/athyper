// Static export/import audit only; does not load application modules or compile.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const server = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const roots = {
  "@athyper/server-service-master-data": "packages/services/master-data/src/index.ts",
  "@athyper/server-contract-master-data": "packages/contracts/master-data/src/index.ts",
  "@athyper/server-plane-neon": "packages/planes/neon/src/index.ts",
  "@athyper/server-plane-mesh": "packages/planes/mesh/src/index.ts",
};
const unresolvedBarrels = [];
function exported(file, seen = new Set()) {
  const result = new Set();
  if (seen.has(file)) return result;
  seen.add(file);
  if (!fs.existsSync(file)) { unresolvedBarrels.push(path.relative(server, file)); return result; }
  const tree = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  for (const node of tree.statements) {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const entry of node.exportClause.elements) result.add(entry.name.text);
      } else if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith(".")) {
        for (const name of exported(path.resolve(path.dirname(file), node.moduleSpecifier.text.replace(/\.js$/, ".ts")), seen)) result.add(name);
      }
    } else if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      if (node.name && ts.isIdentifier(node.name)) result.add(node.name.text);
      if (ts.isVariableStatement(node)) for (const decl of node.declarationList.declarations)
        if (ts.isIdentifier(decl.name)) result.add(decl.name.text);
    }
  }
  return result;
}
const available = Object.fromEntries(Object.entries(roots).map(([name, entry]) => [name, exported(path.join(server, entry))]));
const consumers = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!/\.(?:ts|tsx|mts|mjs)$/.test(entry.name)) continue;
    const tree = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const node of tree.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const source = node.moduleSpecifier.text, symbols = available[source];
      if (!symbols) continue;
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        const missing = bindings.elements.filter(e => !symbols.has((e.propertyName ?? e.name).text));
        if (missing.length) consumers.push({
          file: path.relative(server, file),
          line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
          source,
          missing: missing.map(e => ({ exported: (e.propertyName ?? e.name).text, local: e.name.text, typeOnly: Boolean(node.importClause.isTypeOnly || e.isTypeOnly) })),
        });
      } else if (bindings || node.importClause?.name) {
        consumers.push({ file: path.relative(server, file), source, manualReview: "namespace/default import" });
      }
    }
    function visit(node) {
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        const source = node.argument.literal.text, symbols = available[source];
        if (symbols) {
          const name = node.qualifier?.getText(tree).split(".")[0];
          if (name && !symbols.has(name)) consumers.push({
            file: path.relative(server, file),
            line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
            source,
            missing: [{ exported: name, local: name, typeOnly: true }],
          });
          else if (!name) consumers.push({ file: path.relative(server, file), source, manualReview: "import-type namespace" });
        }
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0]) && available[node.arguments[0].text])
        consumers.push({ file: path.relative(server, file), source: node.arguments[0].text, manualReview: "dynamic import" });
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
}
walk(path.join(server, "apps"));
walk(path.join(server, "packages"));
process.stdout.write(JSON.stringify({ schema: "athyper.deleted-export-inventory/1", note: "Syntactic named import/export and import-type audit; namespace/dynamic imports are flagged for manual review. External re-export resolution requires separate review.", unresolvedBarrels, consumers }, null, 2) + "\n");
