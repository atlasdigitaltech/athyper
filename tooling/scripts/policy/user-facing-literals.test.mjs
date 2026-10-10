import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { analyzeUserFacingLiterals, findLiteralText, LITERAL_ALLOWLIST, LOCALIZED_DIRECTORIES } from "./user-facing-literals.mjs";

const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

test("flags JSX text, user-facing attributes, composites and rendered literals", () => {
  const found = findLiteralText(`export const A = ({ n, label, open }) => (
    <section aria-label="Saved views" title={\`\${label}: \${n}\`} data-kind="table-mode">
      Select all
      {open ? "Hide all filters" : label}
      <i className="a-b" />
    </section>
  );
  const drawer = { label: "Manage views", key: "views" };`);
  assert.deepEqual(found.map((item) => [item.kind, item.text]), [
    ["aria-label", "Saved views"],
    ["title template", "`${label}: ${n}`"],
    ["text", "Select all"],
    ["child", "Hide all filters"],
    ["label property", "Manage views"],
  ]);
});

test("flags an inline locale map (foundation gap 8)", () => {
  const found = findLiteralText(`export const A = ({ locale }) => resolveEntityText({ defaultLocale: "en", values: { en: "Entity sections", ms: "Bahagian entiti" } }, locale);`);
  assert.deepEqual(found.map((item) => [item.kind, item.text]), [["locale map", "Entity sections"]]);
});

test("flags English as a default parameter value (foundation gap 8)", () => {
  const found = findLiteralText(`export function Footer({ resetLabel = "Reset", applyLabel = "Apply", className = "a-footer" }) { return null; }
  export function Panel(title = "Untitled panel") { return title; }`);
  assert.deepEqual(found.map((item) => [item.kind, item.text]), [["default resetLabel", "Reset"], ["default applyLabel", "Apply"], ["default title", "Untitled panel"]]);
});

test("flags English returned from a helper and rendered later (foundation gap 7)", () => {
  const found = findLiteralText(`function group(field) {
    if (field.defaultVisible) return "Recommended fields";
    return field.kind === "date" ? "Dates and time" : "General fields";
  }
  const operatorName = (operator) => ({ eq: "Equals", ne: "Does not equal" })[operator] ?? operator;`);
  assert.deepEqual(found.map((item) => [item.kind, item.text]), [["returned text", "Recommended fields"], ["returned text", "Dates and time"], ["returned text", "General fields"], ["returned text", "Equals"], ["returned text", "Does not equal"]]);
});

test("returned identifiers, class names, message ids and codes pass", () => {
  assert.deepEqual(findLiteralText(`function kind(field) {
    if (field.audit) return "builtIn:audit";
    return field.wide ? "a-entity-list__wide" : "list.chrome.fieldGroup.general";
  }
  const code = (value) => value === 1 ? "range" : value === 2 ? "GET" : "UTC";
  function label(intl) { return intl.message("list.chrome.reset"); }`), []);
});

test("messages, identifiers and punctuation pass", () => {
  assert.deepEqual(findLiteralText(`export const A = ({ intl }) => (
    <p aria-label={intl.message("list.chrome.selection")} className="a-entity-list__bar" data-state="open">
      {intl.message("list.chrome.selectAll", { count: 3 })} ·
    </p>
  );`), []);
});

test("the allowlist excuses listed text and reports entries that no longer match", () => {
  const root = mkdtempSync(join(tmpdir(), "athyper-literals-"));
  roots.push(root);
  mkdirSync(join(root, "src", "nested"), { recursive: true });
  writeFileSync(join(root, "src", "nested", "a.tsx"), `export const A = () => <p title="Imported example" />;`);
  writeFileSync(join(root, "src", "a.test.tsx"), `export const T = () => <p>Ignored in tests</p>;`);
  const allowlist = [{ file: "src/nested/a.tsx", text: "Imported example", reason: "file content" }, { file: "src/gone.tsx", text: "Old", reason: "removed" }];
  assert.deepEqual(analyzeUserFacingLiterals({ root, directories: ["src"], allowlist }), ['src/gone.tsx: allowlisted "Old" no longer appears; remove it from the allowlist']);
});

test("the list package is clean today", () => {
  assert.deepEqual(analyzeUserFacingLiterals({ root: new URL("../../../", import.meta.url).pathname, directories: LOCALIZED_DIRECTORIES, allowlist: LITERAL_ALLOWLIST }), []);
});
