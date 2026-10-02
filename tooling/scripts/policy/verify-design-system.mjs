#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareToRatchet,
  describeImprovements,
  describeRegressions,
  loadRatchet,
  renderRatchet,
  writeRatchet,
} from "./violation-ratchet.mjs";

const RATCHET_PATH = "governance/config/governance/design-system-ratchet.json";
const UPDATE_COMMAND = "pnpm policy:design-system --update-ratchet";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const DEFAULT_SOURCE_ROOTS = ["apps", "packages", "server/packages"];
const DEFAULT_ICON_SOURCE_ROOTS = [
  "apps",
  "packages",
  "server/packages",
  "deploy/config/iam/themes",
];
const PRESENTATION_EXTENSIONS = new Set([".css", ".scss", ".tsx", ".jsx"]);
const ICON_SOURCE_EXTENSIONS = new Set([
  ".css",
  ".scss",
  ".tsx",
  ".jsx",
  ".html",
  ".htm",
  ".ftl",
]);
const DEFAULT_TOKEN_AUTHORITIES = new Set([
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/theme/src/tokens.ts",
  "packages/platform/foundation/brand/src/atlas-modern.ts",
  // Generated from the theme tokens by theme/scripts/build-docs-css.ts (docs-theme:check).
  "apps/docs-external/src/styles/atlas-theme.css",
  "apps/docs-internal/src/styles/atlas-theme.css",
]);
// Runtime values only (measured sizes, computed positions, metadata-driven CSS
// variables); static presentation belongs in a stylesheet.
const DEFAULT_DYNAMIC_INLINE_STYLE_ALLOWLIST = new Set([
  "packages/platform/shell/shell/src/client.tsx:style={{ top: navigationPeek.top }}",
  "packages/platform/foundation/ui/src/preview-frame.tsx:style={{ width }}",
  'packages/platform/foundation/ui/src/searchable-select.tsx:style={{ position: "fixed", ...position }}',
]);

const colorLiteral = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/g;
const arbitraryUtility =
  /className\s*=\s*["'`][^"'`]*(?:bg|text|border|shadow|rounded|p[trblxy]?|m[trblxy]?|gap)-\[[^\]]+\]/g;
const hardcodedUiIcon =
  /[×⌕]|[\u{2190}-\u{21FF}\u{2500}-\u{27BF}\u{1F300}-\u{1FAFF}]/gu;

// Generated output is never hand-authored, so it cannot violate an authoring
// policy. Alternate Next.js distDir outputs (.next-bp-consolidated and friends)
// are generated exactly like .next/, and .gitignore already treats them as such.
function isGeneratedDirectory(name) {
  return (
    name === "node_modules" ||
    name === "dist" ||
    name === "coverage" ||
    name === ".turbo" ||
    name === ".next" ||
    name.startsWith(".next-")
  );
}

// stage-content.mjs copies canonical docs into these ignored build inputs.
// Match complete repository paths; authored public assets elsewhere still count.
const GENERATED_DOCS_PATHS = new Set([
  "apps/docs-internal/public/assets",
  "apps/docs-external/public/assets",
  "apps/docs-internal/src/content/docs",
  "apps/docs-external/src/content/docs",
]);

function lineOf(source, index = 0) {
  return source.slice(0, index).split("\n").length;
}

async function filesBelow(root, relativeDirectory, extensions) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(relativeDirectory, entry.name);
    if (isGeneratedDirectory(entry.name) || GENERATED_DOCS_PATHS.has(relative))
      continue;
    if (entry.isDirectory())
      files.push(...(await filesBelow(root, relative, extensions)));
    else if (extensions.has(path.extname(entry.name))) files.push(relative);
  }
  return files;
}

// Pure design-system audit. Returns every violation as a formatted string so the
// CLI and the fixture tests share one code path. `options` overrides (all
// optional): root, sourceRoots, iconSourceRoots, tokenAuthorities (exempt from
// the literal-color rule only), dynamicInlineStyleAllowlist.
export async function analyzeDesignSystem(options = {}) {
  const root = options.root ?? repoRoot;
  const sourceRoots = options.sourceRoots ?? DEFAULT_SOURCE_ROOTS;
  const iconSourceRoots = options.iconSourceRoots ?? DEFAULT_ICON_SOURCE_ROOTS;
  const tokenAuthorities =
    options.tokenAuthorities ?? DEFAULT_TOKEN_AUTHORITIES;
  const dynamicInlineStyleAllowlist =
    options.dynamicInlineStyleAllowlist ??
    DEFAULT_DYNAMIC_INLINE_STYLE_ALLOWLIST;

  const violations = [];

  const iconFiles = (
    await Promise.all(
      iconSourceRoots.map((directory) =>
        filesBelow(root, directory, ICON_SOURCE_EXTENSIONS),
      ),
    )
  ).flat();
  for (const relative of iconFiles) {
    if (/\.(?:test|spec)\.[jt]sx$/.test(relative)) continue;
    const source = await readFile(path.join(root, relative), "utf8");
    source.split("\n").forEach((line, index) => {
      if (/^\s*<!--.*-->\s*$/.test(line) || /^[─\s]+$/u.test(line)) return;
      for (const match of line.matchAll(hardcodedUiIcon)) {
        violations.push(
          `${relative}:${index + 1} hardcoded UI icon ${JSON.stringify(match[0])}; use @athyper/platform-icons or Lucide-compatible static SVG`,
        );
      }
    });
  }

  const sourceFiles = (
    await Promise.all(
      sourceRoots.map((directory) =>
        filesBelow(root, directory, PRESENTATION_EXTENSIONS),
      ),
    )
  ).flat();
  for (const relative of sourceFiles) {
    const source = await readFile(path.join(root, relative), "utf8");
    if (!tokenAuthorities.has(relative)) {
      for (const match of source.matchAll(colorLiteral)) {
        violations.push(
          `${relative}:${lineOf(source, match.index)} literal color ${match[0]}`,
        );
      }
    }
    for (const match of source.matchAll(arbitraryUtility)) {
      violations.push(
        `${relative}:${lineOf(source, match.index)} arbitrary utility value`,
      );
    }
    source.split("\n").forEach((line, index) => {
      if (!line.includes("style={{")) return;
      const allowed = [...dynamicInlineStyleAllowlist].some(
        (entry) =>
          entry ===
          `${relative}:${line.trim().match(/style=\{\{.*?\}\}/)?.[0] ?? ""}`,
      );
      if (!allowed)
        violations.push(`${relative}:${index + 1} inline presentation style`);
    });
  }

  return { violations };
}

// Each violation is formatted "<repo path>:<line> <detail>".
function fileOf(violation) {
  return String(violation).split(":")[0];
}

async function main() {
  const { violations } = await analyzeDesignSystem();
  const ratchetPath = path.join(repoRoot, RATCHET_PATH);
  const files = violations.map(fileOf);

  if (process.argv.includes("--update-ratchet")) {
    writeRatchet(
      ratchetPath,
      renderRatchet(
        "policy:design-system",
        files,
        "Hand-authored presentation debt predating the token system. Fix down; never up.",
      ),
    );
    console.log(
      `Wrote ${RATCHET_PATH}: ${violations.length} violation(s) across ${new Set(files).size} file(s).`,
    );
    return;
  }

  // The full report always prints, ratcheted or not: debt stays visible.
  if (violations.length)
    console.error(
      "Design-system policy violations:\n" +
        violations.map((violation) => `- ${violation}`).join("\n"),
    );

  const comparison = compareToRatchet(loadRatchet(ratchetPath), files);
  const regressions = describeRegressions(
    "Design-system violations",
    comparison,
    UPDATE_COMMAND,
  );
  if (regressions) {
    console.error("\n" + regressions);
    process.exit(1);
  }
  const improvements = describeImprovements(comparison, UPDATE_COMMAND);
  if (improvements) console.log(improvements);
  console.log(
    violations.length
      ? `Design-system policy passed the ratchet: ${violations.length} known violation(s), none new.`
      : "Design-system policy passed: presentation colors and static styles are token-backed; UI icons use the shared Lucide-compatible system.",
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await main();
}
