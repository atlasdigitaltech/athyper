#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const DEFAULT_THEME_AUTHORITY =
  "packages/platform/foundation/theme/src/styles.css";
const DEFAULT_TARGET_ROOTS = [
  "packages/platform",
  "packages/planes",
  "apps/neon",
  "apps/mesh",
  "apps/studio",
];
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

const TOKEN_DEFINITION = /(--a-[a-z0-9-]+)\s*:/gi;
// group 2 is "," when a fallback follows the token name inside var()
const TOKEN_REFERENCE = /var\(\s*(--a-[a-z0-9-]+)\s*(,)?/gi;
// one CSS declaration: `--a-x: <value>` up to the next ; { or }
const TOKEN_DECLARATION = /(--a-[a-z0-9-]+)\s*:\s*([^;{}]+)/gi;

function stylesheetsBelow(root, relativeDirectory) {
  const absolute = path.join(root, relativeDirectory);
  if (!existsSync(absolute)) return [];
  const out = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        out.push(
          ...stylesheetsBelow(
            root,
            path.posix.join(relativeDirectory, entry.name),
          ),
        );
      }
      continue;
    }
    if (/\.(?:css|scss)$/.test(entry.name))
      out.push(path.posix.join(relativeDirectory, entry.name));
  }
  return out;
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

function definitionsIn(source) {
  const defined = new Set();
  for (const match of source.matchAll(TOKEN_DEFINITION))
    defined.add(match[1].toLowerCase());
  return defined;
}

// Validate the theme authority against itself: every `--a-*` it references must
// be one it defines, and its definition dependency graph must be acyclic. A
// typo (`--a-x: var(--a-typoo)`) or a cycle (`--a-x: var(--a-y); --a-y:
// var(--a-x)`) would otherwise pass, because the consumer check trusts every
// name the authority declares.
export function analyzeAuthorityIntegrity(themeSource, themeAuthority) {
  const defined = definitionsIn(themeSource);
  const findings = [];

  // edges: token -> [--a-* it references in its own value]
  const edges = new Map();
  for (const match of themeSource.matchAll(TOKEN_DECLARATION)) {
    const token = match[1].toLowerCase();
    const deps = [...match[2].matchAll(/var\(\s*(--a-[a-z0-9-]+)/gi)].map((m) =>
      m[1].toLowerCase(),
    );
    edges.set(token, (edges.get(token) ?? []).concat(deps));
  }

  // unknown references anywhere in the authority (definitions + its own rules)
  const seen = new Set();
  for (const match of themeSource.matchAll(TOKEN_REFERENCE)) {
    const token = match[1].toLowerCase();
    if (defined.has(token) || seen.has(token)) continue;
    seen.add(token);
    findings.push({
      severity: "error",
      category: "authority-unknown-reference",
      token,
      file: themeAuthority,
      line: lineOf(themeSource, match.index ?? 0),
      uses: 1,
      detail: "referenced by the theme authority but never defined there",
    });
  }

  // cycle detection over the definition dependency graph
  const state = new Map(); // token -> "visiting" | "done"
  const walk = (token, stack) => {
    state.set(token, "visiting");
    stack.push(token);
    for (const dep of edges.get(token) ?? []) {
      if (state.get(dep) === "visiting") {
        const cycle = stack.slice(stack.indexOf(dep)).concat(dep);
        findings.push({
          severity: "error",
          category: "authority-cycle",
          token: cycle[0],
          file: themeAuthority,
          line: 0,
          uses: 1,
          detail: `dependency cycle: ${cycle.join(" -> ")}`,
        });
      } else if (!state.has(dep) && edges.has(dep)) {
        walk(dep, stack);
      }
    }
    stack.pop();
    state.set(token, "done");
  };
  for (const token of edges.keys()) if (!state.has(token)) walk(token, []);

  return { definedTokens: defined, findings };
}

// Classify every `var(--a-*)` reference in the stylesheets that render into
// `apps/*` as one of:
//
//   - global   — resolves from the theme authority's `--a-*` vocabulary
//   - local    — defined in the same owning stylesheet (component-local token)
//   - unresolved, warning — no definition anywhere, and EVERY occurrence carries
//                           a fallback, so it degrades rather than breaks
//   - unresolved, error   — no definition, and at least one occurrence has no
//                           fallback: renders as an invalid value (transparent
//                           background, no shadow, inherited colour, default
//                           outline)
//
// v1 does not simulate the CSS cascade: a component-local token must be defined
// in the same file, not merely somewhere a selector might inherit it from. It
// also does not govern fallback *syntax* on references that DO resolve — see the
// Phase 5 fallback policy, and `raw-hex-color` in audit-style-tokens for literal
// fallbacks.
// Returns { globalTokenCount, findings: [{ severity, category, token, file, line, uses, detail? }] }.
export function analyzeThemeTokenIntegrity(options = {}) {
  const root = options.root ?? repoRoot;
  const themeAuthority = options.themeAuthority ?? DEFAULT_THEME_AUTHORITY;
  const targetRoots = options.targetRoots ?? DEFAULT_TARGET_ROOTS;

  const themePath = path.join(root, themeAuthority);
  if (!existsSync(themePath)) {
    throw new Error(`theme authority not found: ${themeAuthority}`);
  }
  const themeSource = readFileSync(themePath, "utf8");
  const authority = analyzeAuthorityIntegrity(themeSource, themeAuthority);
  const globalTokens = authority.definedTokens;

  const targetFiles = targetRoots
    .flatMap((dir) => stylesheetsBelow(root, dir))
    .filter((file) => file !== themeAuthority)
    .sort();

  const findings = [...authority.findings];
  for (const file of targetFiles) {
    const source = readFileSync(path.join(root, file), "utf8");
    const localTokens = definitionsIn(source);

    // token -> { line, uses, allUsesHaveFallback }
    const unresolved = new Map();
    for (const match of source.matchAll(TOKEN_REFERENCE)) {
      const token = match[1].toLowerCase();
      if (globalTokens.has(token) || localTokens.has(token)) continue;
      const hasFallback = Boolean(match[2]);
      const existing = unresolved.get(token);
      if (existing) {
        existing.uses += 1;
        // AND, not OR: one bare usage makes the token unsafe even if another
        // usage has a fallback.
        existing.allUsesHaveFallback =
          existing.allUsesHaveFallback && hasFallback;
      } else {
        unresolved.set(token, {
          line: lineOf(source, match.index ?? 0),
          uses: 1,
          allUsesHaveFallback: hasFallback,
        });
      }
    }

    for (const [token, info] of unresolved) {
      findings.push({
        severity: info.allUsesHaveFallback ? "warning" : "error",
        category: "unresolved",
        token,
        file,
        line: info.line,
        uses: info.uses,
      });
    }
  }

  findings.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      a.category.localeCompare(b.category) ||
      a.token.localeCompare(b.token) ||
      a.file.localeCompare(b.file),
  );

  return { globalTokenCount: globalTokens.size, findings };
}

// --strict promotes fallback-backed unknowns (warnings) to failures too, so a
// new `var(--a-typo, something)` cannot slip in behind a fallback. Without it,
// only no-fallback references (which break silently) and authority integrity
// issues fail.
const STRICT = process.argv.includes("--strict");

// The findings that fail the run: everything at "error" severity always (that
// includes authority-unknown-reference and authority-cycle); every unresolved
// reference under --strict.
export function selectFailures(findings, { strict } = {}) {
  return strict
    ? findings
    : findings.filter((finding) => finding.severity === "error");
}

function main() {
  const { globalTokenCount, findings } = analyzeThemeTokenIntegrity();
  const authority = findings.filter((f) => f.category.startsWith("authority-"));
  const errors = findings.filter(
    (f) => f.category === "unresolved" && f.severity === "error",
  );
  const warnings = findings.filter(
    (f) => f.category === "unresolved" && f.severity === "warning",
  );

  console.log(`Theme token integrity${STRICT ? " (strict)" : ""}`);
  console.log(`Global --a-* vocabulary: ${globalTokenCount} tokens`);
  console.log(
    `Authority integrity issues: ${authority.length} | Unresolved references: ${errors.length + warnings.length} (${errors.length} error, ${warnings.length} warning)`,
  );

  if (authority.length > 0) {
    console.log(
      "\nAUTHORITY (theme references or depends on something invalid)",
    );
    for (const finding of authority) {
      console.log(
        `  ${finding.file}:${finding.line} ${finding.token} — ${finding.detail}`,
      );
    }
  }

  for (const group of [
    {
      label: "ERROR   (no definition, at least one usage without a fallback)",
      items: errors,
    },
    {
      label: `WARNING (no definition, every usage has a fallback — ${STRICT ? "rejected in strict mode" : "tolerated during rollout"})`,
      items: warnings,
    },
  ]) {
    if (group.items.length === 0) continue;
    console.log(`\n${group.label}`);
    for (const finding of group.items) {
      console.log(
        `  ${finding.file}:${finding.line} ${finding.token} (${finding.uses}x)`,
      );
    }
  }

  const failing = selectFailures(findings, { strict: STRICT });
  if (failing.length > 0) {
    console.error(
      `\nTheme token integrity failed: ${failing.length} finding(s)` +
        (STRICT ? "." : " (authority issues + no-fallback references)."),
    );
    process.exit(1);
  }
  console.log(
    STRICT
      ? "\nAuthority is self-consistent and no unresolved --a-* references remain."
      : "\nAuthority is self-consistent and no --a-* references break without a fallback.",
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
