#!/usr/bin/env node
// Entity list controls use design-system choices only
// (docs/architecture/application-experience/entity-list-responsive-standard.md §7):
// SegmentedControl for two to four options, ChoiceChips for small value sets and
// SearchableSelect for longer lists. A native <select> renders an operating-system
// popup that ignores the panel's type scale, so it is rejected in these sources.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LIST = "packages/platform/entity/runtime/list-view/src";
const CONTROLS = "packages/platform/entity/runtime/collection-controls/src";
export const CONTROL_SOURCES = [
  `${LIST}/index.tsx`,
  `${LIST}/drawer-registry.tsx`,
  `${LIST}/field-catalogue.tsx`,
  `${LIST}/reorder-menu.tsx`,
  ...readdirSync(path.join(repoRoot, LIST, "dialogs")).filter((file) => file.endsWith(".tsx")).map((file) => `${LIST}/dialogs/${file}`),
  ...readdirSync(path.join(repoRoot, CONTROLS)).filter((file) => file.endsWith(".tsx")).map((file) => `${CONTROLS}/${file}`),
];

export function auditControls(file, source) {
  const violations = [];
  source.split("\n").forEach((line, index) => {
    if (/<select\b/.test(line) || /<Select\b/.test(line))
      violations.push(`${file}:${index + 1} native select in list controls; use SegmentedControl, ChoiceChips or SearchableSelect`);
  });
  return violations;
}

function main() {
  const violations = CONTROL_SOURCES.flatMap((file) =>
    auditControls(file, readFileSync(path.join(repoRoot, file), "utf8")),
  );
  if (violations.length) {
    console.error(`Entity list controls policy: ${violations.length} violation(s)`);
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }
  console.log(`Entity list controls policy: ${CONTROL_SOURCES.length} sources use design-system choices`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
