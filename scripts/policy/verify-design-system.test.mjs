import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { analyzeDesignSystem } from "./verify-design-system.mjs";

const temporaryRoots = [];
after(() => {
  for (const root of temporaryRoots)
    rmSync(root, { recursive: true, force: true });
});

function write(root, path, value) {
  const target = join(root, ...path.split("/"));
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, value);
}

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "athyper-design-system-"));
  temporaryRoots.push(root);
  for (const [path, value] of Object.entries(files)) write(root, path, value);
  return root;
}

const scan = (root) =>
  analyzeDesignSystem({
    root,
    sourceRoots: ["packages"],
    iconSourceRoots: ["packages"],
    tokenAuthorities: new Set(["packages/theme/src/styles.css"]),
    dynamicInlineStyleAllowlist: new Set(),
  });

test("does not crash and passes a clean fixture", async () => {
  const root = fixture({
    "packages/theme/src/styles.css": ":root{--a-surface:#fff}",
    "packages/ui/src/panel.css":
      ".panel{background:var(--a-surface);color:var(--a-foreground)}",
    "packages/ui/src/panel.tsx":
      'export const Panel = () => <div className="bg-surface p-4" />;\n',
  });
  const { violations } = await scan(root);
  assert.deepEqual(violations, []);
});

test("flags a literal color outside a token authority", async () => {
  const root = fixture({
    "packages/theme/src/styles.css": ":root{--a-surface:#fff}",
    "packages/ui/src/panel.css": ".panel{color:#334155}",
  });
  const { violations } = await scan(root);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /panel\.css:1 literal color #334155/);
});

test("exempts the token authority from the literal-color rule", async () => {
  const root = fixture({
    "packages/theme/src/styles.css": ":root{--a-surface:#fff;--a-ink:#111}",
  });
  const { violations } = await scan(root);
  assert.deepEqual(violations, []);
});

test("flags arbitrary utility values and inline presentation styles", async () => {
  const root = fixture({
    "packages/theme/src/styles.css": ":root{--a-surface:#fff}",
    "packages/ui/src/panel.tsx":
      'export const Panel = () => <div className="bg-[#abc123] p-2" style={{ color: "red" }} />;\n',
  });
  const { violations } = await scan(root);
  assert.ok(
    violations.some((entry) => /arbitrary utility value/.test(entry)),
    JSON.stringify(violations),
  );
  assert.ok(
    violations.some((entry) => /inline presentation style/.test(entry)),
    JSON.stringify(violations),
  );
});

test("flags a hardcoded UI icon glyph but ignores test files", async () => {
  const root = fixture({
    "packages/theme/src/styles.css": ":root{--a-surface:#fff}",
    "packages/ui/src/crumb.tsx": "export const Crumb = () => <span>→</span>;\n",
    "packages/ui/src/crumb.test.tsx": 'it("renders", () => <span>→</span>);\n',
  });
  const { violations } = await scan(root);
  const iconHits = violations.filter((entry) =>
    /hardcoded UI icon/.test(entry),
  );
  assert.equal(iconHits.length, 1);
  assert.match(iconHits[0], /crumb\.tsx:1/);
});

test("tolerates a missing scan root instead of throwing", async () => {
  const root = fixture({
    "packages/theme/src/styles.css": ":root{--a-surface:#fff}",
  });
  const { violations } = await analyzeDesignSystem({
    root,
    sourceRoots: ["packages", "does-not-exist"],
    iconSourceRoots: ["also-missing"],
    tokenAuthorities: new Set(["packages/theme/src/styles.css"]),
    dynamicInlineStyleAllowlist: new Set(),
  });
  assert.deepEqual(violations, []);
});
