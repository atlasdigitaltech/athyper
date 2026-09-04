import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { collectFindings } from "./audit-style-tokens.js";

const temporaryRoots: string[] = [];
after(() => {
  for (const root of temporaryRoots)
    rmSync(root, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "athyper-style-tokens-"));
  temporaryRoots.push(root);
  for (const [path, value] of Object.entries(files)) {
    const target = join(root, ...path.split("/"));
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, value);
  }
  return root;
}

const scan = (root: string) =>
  collectFindings({ root, scanRoots: ["packages"] });
const named = (root: string, rule: string) =>
  scan(root).filter((finding) => finding.rule.name === rule);

test("a fully tokenised stylesheet produces no findings", () => {
  const root = fixture({
    "packages/ui/src/panel.css":
      ".p{font-size:var(--a-font-size-sm);font-weight:var(--a-font-weight-regular);color:var(--a-foreground)}",
  });
  assert.deepEqual(scan(root), []);
});

test("flags raw font-size and font-weight in minified multi-rule CSS", () => {
  const root = fixture({
    "packages/ui/src/panel.css":
      ".a{font-size:.72rem;color:red}.b{font-weight:600}.c{font-weight:bold}",
  });
  const hits = named(root, "raw-css-typography").map(
    (finding) => finding.match,
  );
  assert.deepEqual(
    hits.sort(),
    ["font-size: .72rem", "font-weight: 600", "font-weight: bold"].sort(),
  );
});

test("distinct raw declarations on one minified line get distinct line/column", () => {
  const root = fixture({
    "packages/ui/src/panel.css": ".a{font-size:1rem}.b{font-size:2rem}",
  });
  const hits = named(root, "raw-css-typography");
  assert.equal(hits.length, 2);
  assert.equal(hits[0]!.line, 1);
  assert.equal(hits[1]!.line, 1);
  assert.notEqual(hits[0]!.column, hits[1]!.column);
});

test("var()-backed values and CSS-wide keywords are not raw", () => {
  const root = fixture({
    "packages/ui/src/panel.css":
      ".a{font-size:var(--a-font-size-md)}.b{font-weight:normal}.c{font-size:inherit}.d{font-weight:var(--x,700)}",
  });
  assert.deepEqual(named(root, "raw-css-typography"), []);
});

test("font-size:0 and em-relative font-size are allowed (layout primitive / compounding unit)", () => {
  const root = fixture({
    "packages/ui/src/panel.css":
      ".a{font-size:0}.b{font-size:0px}.c{font-size:.84em}.d{font-weight:0}",
  });
  const hits = named(root, "raw-css-typography").map(
    (finding) => finding.match,
  );
  // font-size 0 / 0px / .84em skipped; font-weight:0 is still a raw literal
  assert.deepEqual(hits, ["font-weight: 0"]);
});

test("clamp() / min() / max() font-size is allowed — bespoke fluid type is an intentional escape hatch", () => {
  const root = fixture({
    "packages/ui/src/panel.css":
      ".a{font-size:clamp(.9rem,2vw,1.1rem)}.b{font-size:min(2rem,5vw)}.c{font-size:.72rem}",
  });
  const hits = named(root, "raw-css-typography").map(
    (finding) => finding.match,
  );
  assert.deepEqual(hits, ["font-size: .72rem"]);
});

test("raw-css-tracking-leading flags line-height / letter-spacing but not keywords", () => {
  const root = fixture({
    "packages/ui/src/panel.css":
      ".a{line-height:1.35;letter-spacing:.04em}.b{line-height:normal;letter-spacing:var(--a-tracking-wide)}.c{line-height:inherit}",
  });
  const hits = named(root, "raw-css-tracking-leading")
    .map((finding) => finding.match)
    .sort();
  assert.deepEqual(hits, ["letter-spacing: .04em", "line-height: 1.35"]);
});

test("stock-tailwind-typography flags stock size/weight utilities in any string literal, with variants", () => {
  const root = fixture({
    "packages/ui/src/panel.tsx":
      'const a = clsx("text-xl", cond && "hover:font-bold");\n' +
      "const b = cn(`md:text-2xl`, 'text-danger');\n" +
      'const ok = "text-md font-strong text-body";\n',
  });
  const hits = named(root, "stock-tailwind-typography")
    .map((finding) => finding.match)
    .sort();
  assert.deepEqual(hits, ["hover:font-bold", "md:text-2xl", "text-xl"]);
});

test("custom-property definitions are token declarations, not raw usage", () => {
  const root = fixture({
    "packages/ui/src/panel.css":
      ":root{--a-font-size-md:1rem;--brand-font-weight:700}",
  });
  assert.deepEqual(named(root, "raw-css-typography"), []);
});

test("the raw-css-typography rule does not touch .ts / .tsx sources", () => {
  const root = fixture({
    "packages/ui/src/panel.ts":
      "export const styles = { fontSize: '14px', fontWeight: 600 };",
  });
  assert.deepEqual(named(root, "raw-css-typography"), []);
});

test("raw hex outside a token authority is flagged", () => {
  const root = fixture({ "packages/ui/src/panel.css": ".a{color:#334155}" });
  const hits = named(root, "raw-hex-color");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.match, "#334155");
});

test("the theme authority is exempt from every literal rule", () => {
  const root = fixture({
    "packages/platform/foundation/theme/src/styles.css":
      ":root{--a-surface:#fff;--a-font-size-body:.9375rem;--a-font-weight-regular:500}",
  });
  assert.deepEqual(scan(root), []);
});

test("the brand authority is exempt from color and typography rules only", () => {
  const root = fixture({
    "packages/platform/foundation/brand/src/atlas-modern.ts":
      "export const brand = { ink: '#101820' };\nconst bad = 'bg-[#ff0000]';\n",
  });
  const findings = scan(root);
  assert.deepEqual(named(root, "raw-hex-color"), []);
  // the arbitrary-color-utility rule is not on the brand allowlist
  assert.ok(
    findings.some((finding) => finding.rule.name === "arbitrary-color-utility"),
  );
});

test("missing scan roots do not throw", () => {
  const root = fixture({
    "packages/ui/src/panel.css": ".a{color:var(--a-foreground)}",
  });
  assert.deepEqual(
    collectFindings({ root, scanRoots: ["packages", "gone", "also-gone"] }),
    [],
  );
});
