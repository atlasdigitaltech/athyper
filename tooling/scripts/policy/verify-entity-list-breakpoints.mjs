#!/usr/bin/env node
// Entity list breakpoint scale (docs/architecture/application-experience/entity-list-responsive-standard.md §4).
// Container tiers must equal the runtime constants in presentation-tier.ts; viewport
// queries (overlays, page chrome) may use only the scale values; px/em widths are rejected.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TIER_SOURCE = "packages/platform/entity/runtime/list-view/src/presentation-tier.ts";
export const LIST_STYLESHEETS = [
  "packages/platform/entity/runtime/list-view/src/styles.css",
  "packages/platform/entity/runtime/list-view/src/board/board.css",
  "packages/platform/entity/runtime/list-view/src/date-range/date-range.css",
  "packages/platform/entity/runtime/list-view/src/calendar/calendar.css",
  "packages/platform/entity/runtime/collection-controls/src/styles.css",
];
/** Viewport overlay breakpoint (drawers, dialogs, fixed menus, page header). */
export const OVERLAY_REM = 48;

export function readTiers(source) {
  const value = (name) => {
    const match = source.match(new RegExp(`export const ${name} = (\\d+(?:\\.\\d+)?);`));
    if (!match) throw new Error(`${TIER_SOURCE} must export ${name}`);
    return Number(match[1]);
  };
  return { narrow: value("LIST_NARROW_MAX_REM"), wide: value("LIST_WIDE_MIN_REM") };
}

export function auditBreakpoints(file, css, tiers) {
  const allowed = new Set([tiers.narrow, OVERLAY_REM, tiers.wide]);
  const containerForms = new Set([`(width < ${tiers.narrow}rem)`, `(width < ${tiers.wide}rem)`]);
  const violations = [];
  for (const match of css.matchAll(/@(media|container)([^{]*)\{/g)) {
    const [, kind, rawPrelude] = match;
    const prelude = rawPrelude.trim();
    const line = css.slice(0, match.index).split("\n").length;
    const report = (reason) => violations.push(`${file}:${line} @${kind} ${prelude} — ${reason}`);
    if (kind === "container") {
      const named = prelude.match(/^entity-list\s+(\(.*\))$/);
      if (!named) report("containers must query the named `entity-list` container");
      else if (!containerForms.has(named[1].replace(/\s+/g, " ")))
        report(`use (width < ${tiers.narrow}rem) or (width < ${tiers.wide}rem) to match presentation-tier.ts`);
      continue;
    }
    for (const length of prelude.matchAll(/(\d+(?:\.\d+)?)(px|em|rem)\b/g)) {
      const [text, amount, unit] = length;
      if (unit !== "rem") report(`${text} is not on the rem scale`);
      else if (!allowed.has(Number(amount)))
        report(`${text} is not one of ${[...allowed].map((item) => `${item}rem`).join(", ")}`);
    }
  }
  return violations;
}

function main() {
  const tiers = readTiers(readFileSync(path.join(repoRoot, TIER_SOURCE), "utf8"));
  const violations = LIST_STYLESHEETS.flatMap((file) =>
    auditBreakpoints(file, readFileSync(path.join(repoRoot, file), "utf8"), tiers),
  );
  if (violations.length) {
    console.error(`Entity list breakpoint policy: ${violations.length} violation(s)`);
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }
  console.log(`Entity list breakpoint policy: ${LIST_STYLESHEETS.length} stylesheets on the ${tiers.narrow}/${OVERLAY_REM}/${tiers.wide}rem scale`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
