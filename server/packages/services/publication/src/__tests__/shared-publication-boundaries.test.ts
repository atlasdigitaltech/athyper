import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, expectTypeOf, it } from "vitest";
import { localPreviewRoot } from "../shared/preview/environment.js";
import type { ActiveCaseContract, InitialCaseContract } from "../shared/case-contract/model.js";
import type {
  ActiveCaseContract as LegacyActiveCaseContract,
  InitialCaseContract as LegacyInitialCaseContract,
} from "../entity-case-contract-service.js";

const local = {
  ATHYPER_LOCAL_PREVIEW_ROOT: "/tmp/preview",
  ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
  ATHYPER_LOCAL_WORKSPACE: "1",
  ATHYPER_ENV: "local",
};

it("allows only the registered metadata contract dependency in the collection compiler", () => {
  const path = "../shared/collections/compiler.ts";
  const source = ts.createSourceFile(path,
    readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      expect(ts.isStringLiteral(node.moduleSpecifier)).toBe(true);
      imports.push((node.moduleSpecifier as ts.StringLiteral).text);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      expect(node.isTypeOnly).toBe(true);
      expect((node.moduleSpecifier as ts.StringLiteral).text).toBe("@athyper/server-contract-metadata");
    }
    if (ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node) ||
        (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require")))
      throw Error("Collection compiler dependency bypass");
    ts.forEachChild(node, visit);
  }
  visit(source);
  expect(imports).toEqual(["@athyper/server-contract-metadata"]);
});

it("preserves explicit local-only preview admission without changing the environment", () => {
  expect(localPreviewRoot(Object.freeze({ ...local }))).toBe("/tmp/preview");
  expect(localPreviewRoot({})).toBeUndefined();
  expect(localPreviewRoot({ ...local, ATHYPER_LOCAL_PREVIEW_ROOT: "" })).toBeUndefined();
});

it.each([
  { ATHYPER_DOMAIN_SUFFIX: "athyper.test" },
  { ATHYPER_DOMAIN_SUFFIX: undefined },
  { ATHYPER_LOCAL_WORKSPACE: "0" },
  { ATHYPER_LOCAL_WORKSPACE: undefined },
  { ATHYPER_ENV: "production" },
  { ATHYPER_ENV: undefined },
])("fails closed when a required local coordinate changes: %j", override => {
  expect(() => localPreviewRoot({ ...local, ...override }))
    .toThrow("LOCAL_PREVIEW_ENVIRONMENT_REJECTED");
});

it("keeps compatibility type exports identical without importing legacy runtime code", () => {
  expectTypeOf<ActiveCaseContract>().toEqualTypeOf<LegacyActiveCaseContract>();
  expectTypeOf<InitialCaseContract>().toEqualTypeOf<LegacyInitialCaseContract>();
});

// These are intentionally dependency-free leaf modules. Any new import needs
// boundary review, even a generic-looking barrel or a type-only dependency.
it.each(["shared/preview/environment.ts", "shared/case-contract/model.ts", "shared/authorization/operation-projection.ts"])(
  "keeps %s independent of product/runtime modules",
  path => {
    const source = ts.createSourceFile(path,
      readFileSync(new URL("../" + path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    const dependencies: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) ||
          ts.isImportTypeNode(node) ||
          (ts.isExportDeclaration(node) && node.moduleSpecifier) ||
          (ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require")))
        dependencies.push(node.getText(source));
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(dependencies).toEqual([]);
  },
);
