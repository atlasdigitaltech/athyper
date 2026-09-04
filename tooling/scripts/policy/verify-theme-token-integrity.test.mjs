import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  analyzeAuthorityIntegrity,
  analyzeThemeTokenIntegrity,
  selectFailures,
} from "./verify-theme-token-integrity.mjs";

const temporaryRoots = [];
after(() => {
  for (const root of temporaryRoots)
    rmSync(root, { recursive: true, force: true });
});

const THEME = "packages/platform/foundation/theme/src/styles.css";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "athyper-token-integrity-"));
  temporaryRoots.push(root);
  for (const [path, value] of Object.entries(files)) {
    const target = join(root, ...path.split("/"));
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, value);
  }
  return root;
}

const run = (root) =>
  analyzeThemeTokenIntegrity({
    root,
    themeAuthority: THEME,
    targetRoots: ["packages/platform", "packages/planes"],
  });

test("resolves references from the global theme vocabulary", () => {
  const root = fixture({
    [THEME]: ":root{--a-foreground:#111;--a-surface:#fff}",
    "packages/platform/x/src/styles.css":
      ".x{color:var(--a-foreground);background:var(--a-surface)}",
  });
  const { globalTokenCount, findings } = run(root);
  assert.equal(globalTokenCount, 2);
  assert.deepEqual(findings, []);
});

test("resolves a component-local token defined in the same file", () => {
  const root = fixture({
    [THEME]: ":root{--a-foreground:#111}",
    "packages/platform/ui/src/styles.css":
      ".drawer{--a-drawer-enter-offset:1rem}@keyframes k{from{transform:translateX(var(--a-drawer-enter-offset))}}",
  });
  assert.deepEqual(run(root).findings, []);
});

test("a token defined only in a different file does not resolve (no cascade simulation)", () => {
  const root = fixture({
    [THEME]: ":root{--a-foreground:#111}",
    "packages/platform/a/src/styles.css": ".a{--a-local:2px}",
    "packages/platform/b/src/styles.css": ".b{margin:var(--a-local)}",
  });
  const findings = run(root).findings;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].token, "--a-local");
  assert.equal(findings[0].file, "packages/platform/b/src/styles.css");
});

test("unresolved without a fallback is an error; with a fallback is a warning", () => {
  const root = fixture({
    [THEME]: ":root{--a-foreground:#111}",
    "packages/platform/x/src/styles.css":
      ".x{outline-color:var(--a-ring)}.y{border-color:var(--a-border-color,currentColor)}",
  });
  const { findings } = run(root);
  const ring = findings.find((f) => f.token === "--a-ring");
  const border = findings.find((f) => f.token === "--a-border-color");
  assert.equal(ring.severity, "error");
  assert.equal(border.severity, "warning");
});

test("mixed usage — one occurrence without a fallback makes the token an error", () => {
  const root = fixture({
    [THEME]: ":root{--a-foreground:#111}",
    "packages/platform/x/src/styles.css":
      ".a{color:var(--a-ghost,#000)}.b{color:var(--a-ghost)}",
  });
  const ghost = run(root).findings.find((f) => f.token === "--a-ghost");
  assert.equal(ghost.severity, "error");
  assert.equal(ghost.uses, 2);
});

test("authority: flags an --a-* the theme references but never defines", () => {
  const { findings } = analyzeAuthorityIntegrity(
    ":root{--a-foreground:#111;--a-text:var(--a-foreground);--a-accent:var(--a-brandd)}",
    THEME,
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, "authority-unknown-reference");
  assert.equal(findings[0].token, "--a-brandd");
  assert.equal(findings[0].severity, "error");
});

test("authority: flags a dependency cycle in the theme's own tokens", () => {
  const { findings } = analyzeAuthorityIntegrity(
    ":root{--a-x:var(--a-y);--a-y:var(--a-z);--a-z:var(--a-x)}",
    THEME,
  );
  const cycle = findings.find((f) => f.category === "authority-cycle");
  assert.ok(cycle, JSON.stringify(findings));
  assert.match(cycle.detail, /--a-x -> --a-y -> --a-z -> --a-x/);
});

test("authority findings fail the run in both default and strict mode", () => {
  const root = fixture({ [THEME]: ":root{--a-x:var(--a-missing)}" });
  const { findings } = run(root);
  assert.equal(selectFailures(findings, { strict: false }).length, 1);
  assert.equal(selectFailures(findings, { strict: true }).length, 1);
});

test("a clean authority (all internal references resolve, no cycle) produces no findings", () => {
  const { findings } = analyzeAuthorityIntegrity(
    ":root{--a-brand:#234b84;--a-primary:var(--a-brand);--a-primary-hover:color-mix(in srgb,var(--a-brand) 82%,black)}",
    THEME,
  );
  assert.deepEqual(findings, []);
});

test("counts every use of an unresolved token and reports it once", () => {
  const root = fixture({
    [THEME]: ":root{--a-foreground:#111}",
    "packages/platform/x/src/styles.css":
      ".a{box-shadow:var(--a-shadow-sm)}.b{box-shadow:var(--a-shadow-sm)}.c{box-shadow:var(--a-shadow-sm)}",
  });
  const { findings } = run(root);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].token, "--a-shadow-sm");
  assert.equal(findings[0].uses, 3);
});

test("selectFailures: default fails only no-fallback refs; --strict fails every unresolved ref", () => {
  const root = fixture({
    [THEME]: ":root{--a-foreground:#111}",
    "packages/platform/x/src/styles.css":
      ".x{outline-color:var(--a-ring)}.y{border-color:var(--a-border-color,currentColor)}",
  });
  const { findings } = run(root);
  assert.deepEqual(
    selectFailures(findings, { strict: false }).map((f) => f.token),
    ["--a-ring"],
  );
  assert.deepEqual(
    selectFailures(findings, { strict: true })
      .map((f) => f.token)
      .sort(),
    ["--a-border-color", "--a-ring"],
  );
});

test("nested var() fallback (var(--x,var(--y))) counts as having a fallback", () => {
  const root = fixture({
    [THEME]: ":root{--a-primary:#111}",
    "packages/platform/x/src/styles.css":
      ".x{outline-color:var(--a-focus-ring,var(--a-primary))}",
  });
  const { findings } = run(root);
  assert.equal(findings[0].token, "--a-focus-ring");
  assert.equal(findings[0].severity, "warning");
});

test("the theme authority itself is not scanned as a target", () => {
  const root = fixture({
    [THEME]: ":root{--a-foreground:var(--a-raw-seed);--a-raw-seed:#111}",
  });
  assert.deepEqual(run(root).findings, []);
});

test("throws when the theme authority is missing", () => {
  const root = fixture({
    "packages/platform/x/src/styles.css": ".x{color:var(--a-foreground)}",
  });
  assert.throws(() => run(root), /theme authority not found/);
});
