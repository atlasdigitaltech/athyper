import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  parseEntityRecordPresentation,
  readableRecordPresentation,
} from "../../packages/contracts/platform/entity-runtime/src/record-presentation";
import { parseEntityDetailNavigation } from "../../packages/contracts/platform/entity-runtime/src/detail-navigation";

const source = {
  schemaVersion: 1,
  titleField: "name",
  sections: [
    { key: "identity", label: "Identity", fields: ["name"] },
    { key: "audit", label: "Audit", fields: ["created"] },
  ],
};
test("older presentations retain their shape without an inferred navigation mode", () => {
  assert.equal(parseEntityRecordPresentation(source).navigation, undefined);
});
test("explicit navigation round trips and inaccessible sections cannot leak through tabs", () => {
  const parsed = parseEntityRecordPresentation({
    ...source,
    navigation: {
      mode: "scroll",
      tabs: [
        { key: "details", label: "Details", sectionKeys: ["identity"] },
        { key: "history", label: "History", sectionKeys: ["audit"] },
      ],
    },
  });
  assert.equal(parsed.navigation?.mode, "scroll");
  const visible = readableRecordPresentation(parsed, ["name"], [], "name");
  assert.deepEqual(visible.navigation?.tabs, [
    { key: "details", label: "Details", sectionKeys: ["identity"] },
  ]);
  assert.deepEqual(
    parseEntityRecordPresentation(visible).navigation,
    visible.navigation,
  );
});
test("navigation rejects ambiguous, unknown, uncovered and executable configuration", () => {
  for (const navigation of [
    { mode: "automatic" },
    { mode: "scroll", script: "alert(1)" },
    { mode: "scroll", tabs: [] },
    {
      mode: "switch",
      tabs: [{ key: "one", label: "One", sectionKeys: ["missing"] }],
    },
    {
      mode: "scroll",
      tabs: [
        { key: "one", label: "One", sectionKeys: ["identity", "identity"] },
      ],
    },
    {
      mode: "scroll",
      tabs: [{ key: "one", label: "One", sectionKeys: ["identity"] }],
    },
  ])
    assert.throws(() =>
      parseEntityDetailNavigation(navigation, ["identity", "audit"]),
    );
});
test("metadata detail composition has an explicit shared-only import boundary", () => {
  const path =
    "packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx";
  const source = readFileSync(path, "utf8");
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const imports: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      assert.ok(ts.isStringLiteral(node.moduleSpecifier));
      imports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node))
      assert.equal(
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"),
        false,
      );
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.deepEqual(
    imports.sort(),
    [
      "react",
      "@athyper/contract-platform-entity-runtime",
      "@athyper/platform-shell",
      "@athyper/platform-ui",
      "@athyper/platform-i18n/entity-labels",
      "@athyper/platform-i18n/entity-react",
      "./detail-collaboration",
      "./record-fields",
      "./record-header",
      "./record/record-navigation",
      "./record/record-summary-panel",
      "./section-navigation",
      "./record/write-record-location",
      "./record/record-view-preferences",
      "./related-entity-section",
    ].sort(),
  );
  assert.doesNotMatch(source, /\b(country|currency|business_partner)\b/);
});
