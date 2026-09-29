import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

const source = fileURLToPath(new URL("../../../", import.meta.url));
function runtimeClosure(
  entry: string,
  visited = new Set<string>(),
): Set<string> {
  if (visited.has(entry)) return visited;
  visited.add(entry);
  const tree = ts.createSourceFile(
    entry,
    readFileSync(entry, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node: ts.Node) {
    let specifier: string | undefined;
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const typeOnly =
        clause?.isTypeOnly ||
        (bindings &&
          ts.isNamedImports(bindings) &&
          !clause?.name &&
          bindings.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) specifier = node.moduleSpecifier.text;
    }
    if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specifier = node.moduleSpecifier.text;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      expect(node.arguments).toHaveLength(1);
      expect(ts.isStringLiteral(node.arguments[0]!)).toBe(true);
      specifier = (node.arguments[0] as ts.StringLiteral).text;
    }
    if (specifier?.startsWith("."))
      runtimeClosure(
        resolve(dirname(entry), specifier.replace(/\.js$/, ".ts")),
        visited,
      );
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return visited;
}

it.each([
  "databases",
  "storage",
  "telemetry",
  "identity",
  "cache",
  "messaging",
  "document-processing",
  "secrets",
  "publication-trust",
])(
  "%s can load without importing combined host registrars or another resource registrar",
  (name) => {
    const paths = [
      ...runtimeClosure(
        resolve(source, `composition/infrastructure/${name}.ts`),
      ),
    ].map((p) => relative(source, p));
    expect(
      paths.some((p) =>
        /composition\/register-(adapters|platform|services|runtimes)\.ts$/.test(
          p,
        ),
      ),
    ).toBe(false);
    expect(paths.some((p) => /composition\/spaces\//.test(p))).toBe(false);
    for (const other of [
      "databases",
      "storage",
      "telemetry",
      "identity",
      "cache",
      "messaging",
      "document-processing",
      "secrets",
      "publication-trust",
    ])
      if (other !== name)
        expect(paths).not.toContain(`composition/infrastructure/${other}.ts`);
  },
);

it("shared Entity identity authority does not load host routes, Studio administration, or compatibility registrars", () => {
  const paths = [
    ...runtimeClosure(
      resolve(source, "composition/shared/identity/authority.ts"),
    ),
  ].map((p) => relative(source, p));
  expect(paths).not.toContain("composition/register-platform.ts");
  expect(paths).not.toContain("composition/register-services.ts");
  expect(paths.some((p) => /composition\/spaces\/|routes\.ts$/.test(p))).toBe(
    false,
  );
});

it.each(["services", "resources", "http-registrars", "transfers", "experience"])(
  "Entity %s composition stays independent of host and space registrars",
  (name) => {
    const closure = [
      ...runtimeClosure(
        resolve(source, `composition/shared/entity-runtime/${name}.ts`),
      ),
    ];
    const paths = closure.map((p) => relative(source, p));
    expect(
      paths.some((p) =>
        /composition\/register-|composition\/spaces\/|development\//.test(p),
      ),
    ).toBe(false);
    for (const file of closure) {
      const tree = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const node of tree.statements) {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          expect(node.moduleSpecifier.text).not.toMatch(
            /^@athyper\/server-plane-/,
          );
      }
    }
  },
);

it.each(["persistence", "authorization-management"])("governance %s excludes combined and space composition", name => {
  const paths = [...runtimeClosure(resolve(source, `composition/shared/entity-governance/${name}.ts`))].map(p => relative(source, p));
  expect(paths.some(p => /composition\/register-|composition\/spaces\/|development\//.test(p))).toBe(false);
});

it("publication target composition excludes development and combined registration", () => {
  const paths = [...runtimeClosure(resolve(source, "composition/shared/publication/targets.ts"))].map(p => relative(source, p));
  expect(paths.some(p => /composition\/register-|composition\/spaces\/|development\//.test(p))).toBe(false);
});
