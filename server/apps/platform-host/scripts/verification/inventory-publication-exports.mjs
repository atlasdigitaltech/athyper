// Read-only static inventory. Prints JSON; does not load application modules.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const packageRoot = resolve(root, "server/packages/services/publication");
const require = createRequire(resolve(packageRoot, "package.json"));
const ts = require("typescript");
const index = resolve(packageRoot, "src/index.ts");
const program = ts.createProgram([index], {
  module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022, skipLibCheck: true,
});
const checker = program.getTypeChecker();
const source = program.getSourceFile(index);
const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(source)).map(symbol => {
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = target.declarations?.[0];
  if (!declaration) throw Error("Unresolved export: " + symbol.name);
  return { symbol: symbol.name, source: relative(root, declaration.getSourceFile().fileName), consumers: [] };
}).sort((a, b) => a.symbol.localeCompare(b.symbol));
// Include non-barrel helpers too: a source-file deletion affects every direct
// consumer, not only consumers of names re-exported by index.ts.
const modules = new Set(execFileSync("rg", ["--files", "src", "-g", "*.ts", "-g", "!**/__tests__/**"],
  { cwd: packageRoot, encoding: "utf8" }).trim().split("\n").map(file => resolve(packageRoot, file)));
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const moduleConsumers = [];
const packageImports = [];
const files = execFileSync("rg", ["--files", "-g", "*.ts", "-g", "*.tsx", "-g", "*.mts", "-g", "*.mjs", "-g", "*.js"], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }).trim().split("\n");
function targetPath(file, specifier) {
  if (specifier === manifest.name) return index;
  if (specifier.startsWith(manifest.name + "/")) {
    const entry = manifest.exports["." + specifier.slice(manifest.name.length)];
    return typeof entry === "string" ? resolve(packageRoot, entry) : undefined;
  }
  if (!specifier.startsWith(".")) return undefined;
  const path = resolve(dirname(file), specifier);
  return [path.replace(/\.js$/, ".ts"), path, resolve(path, "index.ts")].find(candidate => existsSync(candidate) && (modules.has(candidate) || candidate === index));
}
for (const file of files) {
  const absolute = resolve(root, file);
  const text = readFileSync(absolute, "utf8");
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    let specifier, names;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifier = node.moduleSpecifier.text;
      const bindings = node.importClause?.namedBindings;
      names = bindings && ts.isNamedImports(bindings) ? bindings.elements.map(e => (e.propertyName ?? e.name).text) : ["*"];
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifier = node.moduleSpecifier.text;
      names = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.map(e => (e.propertyName ?? e.name).text) : ["*"];
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require") && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      specifier = node.arguments[0].text; names = ["*"];
    }
    if (specifier) {
      const target = targetPath(absolute, specifier);
      const reference = { file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, specifier, names };
      if (specifier.startsWith(manifest.name)) packageImports.push(reference);
      if (target && (modules.has(target) || target === index) && absolute !== index) {
        moduleConsumers.push({ ...reference, target: relative(root, target) });
        for (const entry of exports) {
          if ((target === index || resolve(root, entry.source) === target) && (names.includes("*") || names.includes(entry.symbol)))
            entry.consumers.push(reference);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const sourceConsumers = [...modules].filter(file => file !== index).sort().map(file => {
  const source = relative(root, file);
  const names = exports.filter(entry => entry.source === source).map(entry => entry.symbol);
  return { source, consumers: moduleConsumers.filter(edge => edge.target === source ||
    (edge.target === relative(root, index) && edge.names.some(name => name === "*" || names.includes(name)))) };
});
console.log(JSON.stringify({
  method: "TypeScript checker barrel exports; static named/namespace imports, re-exports and literal import()/require(). Namespace edges are conservative, not proof of symbol usage. Computed imports, non-source configs and downstream repositories excluded.",
  exports, moduleConsumers, sourceConsumers, packageImports, subpaths: manifest.exports,
}, null, 2));
