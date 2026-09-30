// Read-only source inventory: no imports of host code, tests, build or services.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const host = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(host, "src");
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") walk(path.join(directory, entry.name));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(path.join(directory, entry.name));
    }
  }
}
walk(source);
const inventory = files.sort().map(file => {
  const text = fs.readFileSync(file, "utf8");
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports = [];
  const registrations = [];
  const identifiers = new Set();
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      let missing = false;
      if (specifier.startsWith(".")) {
        const target = path.resolve(path.dirname(file), specifier);
        const stem = target.replace(/\.js$/, "");
        missing = ![target, `${stem}.ts`, `${stem}.tsx`, path.join(stem, "index.ts")].some(p => fs.existsSync(p));
      }
      imports.push({ specifier, typeOnly: Boolean(node.importClause?.isTypeOnly), missing });
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(tree);
      if (/register|\.route$|\.addJob$|\.schedule$|\.onShutdown$|\.httpRegistrars\.push$|\.health\./i.test(callee)) {
        registrations.push({
          line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
          callee,
          arguments: node.arguments.map(arg => arg.getText(tree).slice(0, 180)),
        });
      }
    }
    if (ts.isStringLiteral(node) && /^(\/api\/|(?:studio|neon|mesh|entity)\.)/.test(node.text)) identifiers.add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return {
    file: path.relative(host, file),
    lines: text.split("\n").length - Number(text.endsWith("\n")),
    imports,
    registrations,
    identifiers: [...identifiers].sort(),
    syntaxDiagnostics: tree.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, " ")),
  };
});
process.stdout.write(JSON.stringify({
  schema: "athyper.host-source-inventory/1",
  note: "Static candidate inventory; dynamic registrations require manual ownership review. No runtime or compilation verification.",
  files: inventory,
}, null, 2) + "\n");
