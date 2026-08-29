#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoots = ["apps", "packages", "server/packages"];
const presentationExtensions = new Set([".css", ".scss", ".tsx", ".jsx"]);
const iconSourceRoots = ["apps", "packages", "server/packages", "stack/config/iam/themes", "stack/config/gateway/fallback"];
const iconSourceExtensions = new Set([".css", ".scss", ".tsx", ".jsx", ".html", ".htm", ".ftl"]);
const tokenAuthorities = new Set([
  "packages/platform/foundation/theme/src/styles.css",
  "packages/platform/foundation/theme/src/tokens.ts",
  "packages/platform/foundation/brand/src/atlas-modern.ts",
]);
const dynamicInlineStyleAllowlist = new Set([
  "packages/platform/shell/shell/src/client.tsx:style={{ top: navigationPeek.top }}",
]);
const colorLiteral = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/g;
const arbitraryUtility = /className\s*=\s*["'`][^"'`]*(?:bg|text|border|shadow|rounded|p[trblxy]?|m[trblxy]?|gap)-\[[^\]]+\]/g;

async function filesBelow(relativeDirectory, extensions = presentationExtensions) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(relativeDirectory, entry.name);
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
    if (entry.isDirectory()) files.push(...await filesBelow(relative, extensions));
    else if (extensions.has(path.extname(entry.name))) files.push(relative);
  }
  return files;
}

const hardcodedUiIcon = /[×⌕]|[\u{2190}-\u{21FF}\u{2500}-\u{27BF}\u{1F300}-\u{1FAFF}]/gu;
for (const relative of (await Promise.all(iconSourceRoots.map((directory) => filesBelow(directory, iconSourceExtensions)))).flat()) {
  if (/\.(?:test|spec)\.[jt]sx$/.test(relative)) continue;
  const source = await readFile(path.join(root, relative), "utf8");
  source.split("\n").forEach((line, index) => {
    if (/^\s*<!--.*-->\s*$/.test(line) || /^[─\s]+$/u.test(line)) return;
    for (const match of line.matchAll(hardcodedUiIcon)) violations.push(`${relative}:${index + 1} hardcoded UI icon ${JSON.stringify(match[0])}; use @athyper/platform-icons or Lucide-compatible static SVG`);
  });
}

const violations = [];
for (const relative of (await Promise.all(sourceRoots.map((directory) => filesBelow(directory)))).flat()) {
  const source = await readFile(path.join(root, relative), "utf8");
  if (!tokenAuthorities.has(relative)) {
    for (const match of source.matchAll(colorLiteral)) violations.push(`${relative}:${lineOf(source, match.index)} literal color ${match[0]}`);
  }
  for (const match of source.matchAll(arbitraryUtility)) violations.push(`${relative}:${lineOf(source, match.index)} arbitrary utility value`);
  source.split("\n").forEach((line, index) => {
    if (!line.includes("style={{")) return;
    const allowed = [...dynamicInlineStyleAllowlist].some((entry) => entry === `${relative}:${line.trim().match(/style=\{\{.*?\}\}/)?.[0] ?? ""}`);
    if (!allowed) violations.push(`${relative}:${index + 1} inline presentation style`);
  });
}

if (violations.length) {
  console.error("Design-system policy violations:\n" + violations.map((violation) => `- ${violation}`).join("\n"));
  process.exit(1);
}
console.log("Design-system policy passed: presentation colors and static styles are token-backed; UI icons use the shared Lucide-compatible system.");

function lineOf(source, index = 0) { return source.slice(0, index).split("\n").length; }
