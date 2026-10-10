import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  analyzeUiSystem,
  areaOf,
  auditComponent,
  auditScript,
  auditStylesheet,
  ratchetKey,
  readBreakpointScale,
  scorecard,
  selectorAt,
  subjects,
} from "./verify-ui-system.mjs";

const scale = [40, 48, 64, 80];
const rules = (findings) => findings.map((finding) => finding.rule);

test("reads the breakpoint scale from the theme tokens", () => {
  assert.deepEqual(
    readBreakpointScale(
      "export const BREAKPOINT_SCALE = Object.freeze({ narrow: 40, medium: 48, wide: 64, extraWide: 80 });",
    ),
    scale,
  );
  assert.throws(
    () => readBreakpointScale("export const OTHER = 1;"),
    /BREAKPOINT_SCALE/,
  );
});

test("accepts scale breakpoints, token sizes and local stacking", () => {
  const css = [
    "@media (max-width:48rem){.a{height:var(--a-control-height)}}",
    "@container entity-list (width < 40rem){.b{min-height:var(--a-touch-target)}}",
    "@media (80rem <= width){.c{border-radius:var(--a-radius-md)}}",
    "@media (pointer:coarse){.d{min-height:1rem;height:1px;height:100%;height:12rem}}",
    ".e{border-radius:0;border-radius:50%;z-index:2}",
  ].join("\n");
  assert.deepEqual(auditStylesheet(css, scale), []);
});

test("rejects off-scale breakpoints, fixed control heights, raw radii and page layers", () => {
  const css = [
    "@media (max-width:760px){.a{}}",
    "@container (min-width:52.001rem){.b{}}",
    ".c-toggle{height:2.35rem;min-height:40px;block-size:4rem}",
    ".d{border-radius:.5rem;border-top-left-radius:999px}",
    ".e{z-index:40}",
  ].join("\n");
  const findings = auditStylesheet(css, scale);
  assert.deepEqual(rules(findings), [
    "breakpoint-scale",
    "breakpoint-scale",
    "control-height",
    "control-height",
    "control-height",
    "raw-radius",
    "raw-radius",
    "raw-layer",
  ]);
  assert.equal(findings[0].line, 1);
  assert.match(
    findings[0].detail,
    /760px is not one of 40rem, 48rem, 64rem, 80rem/,
  );
  assert.equal(findings[2].line, 3);
});

test("rejects native selects in components", () => {
  assert.deepEqual(
    rules(auditComponent("<Field><select value={v}/></Field>\n<Select>")),
    ["native-select", "native-select"],
  );
  assert.deepEqual(auditComponent("<SearchableSelect options={o}/>"), []);
});

test("matchMedia widths in scripts follow the viewport scale", () => {
  assert.deepEqual(
    rules(auditScript('matchMedia("(max-width: 760px)");\nmatchMedia("(width < 52rem)")', scale)),
    ["breakpoint-scale", "breakpoint-scale"],
  );
  assert.deepEqual(auditScript('window.matchMedia("(48rem <= width < 80rem)"); matchMedia("(prefers-color-scheme: dark)")', scale), []);
  // The container-only tier is not a viewport width.
  assert.deepEqual(rules(auditScript('matchMedia("(width < 24rem)")', scale)), ["breakpoint-scale"]);
});

test("scans source roots, skips tests and generated output, and exempts token authorities", () => {
  const root = mkdtempSync(path.join(tmpdir(), "ui-system-"));
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  write(
    "packages/platform/shell/shell/src/styles.css",
    ".a button{height:2rem}",
  );
  write("packages/platform/shell/shell/src/menu.tsx", "<select/>");
  write("packages/platform/shell/shell/src/media.ts", 'matchMedia("(max-width: 760px)")');
  write("packages/platform/shell/shell/src/menu.test.tsx", "<select/>");
  write("packages/platform/shell/shell/dist/styles.css", ".a{height:2rem}");
  write("packages/platform/foundation/theme/src/styles.css", ".a{height:2rem}");
  write("packages/platform/foundation/ui/src/index.tsx", "<select/>");
  const findings = analyzeUiSystem({ root, sourceRoots: ["packages"], scale });
  assert.deepEqual(findings.map(ratchetKey).sort(), [
    "packages/platform/shell/shell/src/media.ts#breakpoint-scale",
    "packages/platform/shell/shell/src/menu.tsx#native-select",
    "packages/platform/shell/shell/src/styles.css#control-height",
  ]);
});

test("groups findings into scorecard areas", () => {
  assert.equal(
    areaOf("packages/platform/foundation/theme/src/styles.css"),
    "Theme tokens",
  );
  assert.equal(
    areaOf("packages/platform/shell/shell/src/styles.css"),
    "Shell, Home, Activity",
  );
  assert.equal(
    areaOf("deploy/config/iam/themes/neon/login/resources/css/login.css"),
    "IAM sign-in theme",
  );
  const rows = scorecard([
    {
      file: "packages/platform/entity/runtime/list-view/src/styles.css",
      column: "raw-radius",
    },
    {
      file: "packages/platform/entity/runtime/list-view/src/index.tsx",
      column: "raw-radius",
    },
  ]);
  assert.equal(rows.get("Entity runtime").get("raw-radius"), 2);
});

test("rejects brand identity colour used for text and icons", () => {
  const css =
    ".a{color:var(--a-brand)}.b{background:var(--a-brand);color:var(--a-brand-foreground)}.c{border-color:var(--a-brand);fill:var(--a-brand)}.d{color:var(--a-primary)}";
  assert.deepEqual(rules(auditStylesheet(css, scale)), [
    "brand-text",
    "brand-text",
  ]);
});

test("control-height judges the element a rule sizes, not its ancestors", () => {
  assert.deepEqual(subjects(".a>summary>.avatar, .b :is(select,button)"), [".avatar", ":is(select,button)"]);
  assert.deepEqual(rules(auditStylesheet(".menu>summary>.avatar{height:2.3rem}.bar>div>svg{height:1.75rem}", scale)), []);
  assert.deepEqual(rules(auditStylesheet(".avatar-menu>summary{min-height:3rem}", scale)), ["control-height"]);
});

test("control-height applies to interactive selectors, not media sizes", () => {
  const css = [
    ".a-card__avatar{height:2rem}.a-empty__icon{block-size:3rem}",
    ".a-toolbar button{min-height:2rem}.a-list__row{height:2.5rem}",
    "@media (width < 48rem){.a-panel__toggle{min-block-size:2.25rem}}",
  ].join("\n");
  assert.deepEqual(rules(auditStylesheet(css, scale)), [
    "control-height",
    "control-height",
    "control-height",
  ]);
  assert.equal(selectorAt("@media (x){.a b{height:2rem}}", 20), ".a b");
});

test("a BEM __button or -button class is a control, though it has no word boundary before button", () => {
  // `\bbutton\b` cannot match `.a-entity-compare__button`: `_` is a word
  // character. Without its own alternative every __button escaped this rule.
  assert.deepEqual(rules(auditStylesheet(".a-entity-compare__button{min-block-size:2rem}.a-toolbar-button{height:2rem}", scale)), ["control-height", "control-height"]);
  assert.deepEqual(rules(auditStylesheet(".a-entity-compare__button{min-block-size:var(--a-density-control-height-small)}", scale)), []);
});

test("the compact tier is for containers only, never the viewport", () => {
  const tokens =
    'export const BREAKPOINT_SCALE = Object.freeze({ compact: 24, narrow: 40, medium: 48, wide: 64, extraWide: 80 });\nexport const CONTAINER_ONLY_BREAKPOINTS: readonly BreakpointName[] = Object.freeze(["compact"]);';
  const full = readBreakpointScale(tokens),
    viewport = readBreakpointScale(tokens, { viewport: true });
  assert.deepEqual(full, [24, 40, 48, 64, 80]);
  assert.deepEqual(viewport, [40, 48, 64, 80]);
  const css =
    "@container files (width < 24rem){.a{}}\n@media (width < 24rem){.b{}}";
  const findings = auditStylesheet(css, full, viewport);
  assert.deepEqual(rules(findings), ["breakpoint-scale"]);
  assert.match(
    findings[0].detail,
    /@media 24rem is not one of 40rem, 48rem, 64rem, 80rem/,
  );
});

test("rejects text placed on the brand tint", () => {
  const css =
    ".a{background:var(--a-brand-soft);color:var(--a-primary)}.b{background:var(--a-brand-soft)}.c{background:var(--a-selection-subtle);color:var(--a-selection-subtle-foreground)}";
  assert.deepEqual(rules(auditStylesheet(css, scale)), ["brand-tint-text"]);
});
