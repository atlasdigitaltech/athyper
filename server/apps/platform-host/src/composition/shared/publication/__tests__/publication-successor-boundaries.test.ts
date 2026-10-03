import { readFileSync } from "node:fs";
import * as fs from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { assertPublicationCompilerIdentity, publicationCompilerIdentity } from "../compiler-build.js";
vi.mock("node:fs", async importOriginal => {
  const actual=await importOriginal<typeof import("node:fs")>();
  return {...actual,readFileSync:vi.fn(actual.readFileSync)};
});

it("measures a repeatable compiler source identity and refuses changed build pins", () => {
  const pin = publicationCompilerIdentity();
  expect(publicationCompilerIdentity()).toEqual(pin);
  expect(pin.buildHash).toMatch(/^[a-f0-9]{64}$/);
  expect(() => assertPublicationCompilerIdentity(pin)).not.toThrow();
  expect(() => assertPublicationCompilerIdentity({ ...pin, buildHash: "0".repeat(64) })).toThrow("BUILD_CHANGED");
});
it("pins browser-safe entity contract validation used by the compiler", async () => {
  const before=publicationCompilerIdentity();
  const original=(await vi.importActual<typeof import("node:fs")>("node:fs")).readFileSync;
  const reader=vi.mocked(fs.readFileSync).mockImplementation(((path: Parameters<typeof original>[0], ...args: unknown[]) => {
    const value=Reflect.apply(original,fs,[path,...args]);
    return String(path).endsWith("/entity-runtime/src/validation/entity-code.ts") ? Buffer.concat([value as Buffer,Buffer.from("\n// qualification mutation\n")]) : value;
  }) as typeof original);
  try { expect(publicationCompilerIdentity().buildHash).not.toBe(before.buildHash); }
  finally { reader.mockImplementation(original); }
});
it.each([
  ["compiler-build", ["node:crypto", "node:fs", "node:path", "node:url", "node:module"]],
  ["enrollment-contract", ["./human-publication-policy.js", "@athyper/server-contract-publication", "@athyper/server-plane-studio-meta-entity-authoring"]],
  ["successor-targets", ["kysely", "@athyper/server-contract-publication"]],
] as const)("enforces the %s dependency boundary", (name, imports) => {
  const text = readFileSync(new URL(`../${name}.ts`, import.meta.url), "utf8");
  const tree = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true), allowed = new Set<string>(imports);
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) expect(allowed.has(node.moduleSpecifier.text)).toBe(true);
    if (ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node) || (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(tree) === "require"))) throw Error("Import bypass");
    node.forEachChild(visit);
  }
  visit(tree); expect(text).not.toMatch(/country|currency|business_partner/);
});
