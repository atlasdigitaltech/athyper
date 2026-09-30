#!/usr/bin/env node
// Postbuild gate: scans the actual built dist/ (HTML, Pagefind search index,
// sitemap.xml, any RSS/Atom feed) for content that must never be published,
// rather than trusting the markdown source tree alone. Run after `astro
// build` for both targets.
//
// Usage: node verify-output.mjs --target external|internal

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isCustomer, isForcedInternal } from "./lib/classify.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DOCS_ROOT = path.join(REPO_ROOT, "docs");

const target = parseTarget(process.argv);
const DIST = path.join(REPO_ROOT, "apps", `docs-${target}`, "dist");

function parseTarget(argv) {
  const flag = argv.find((arg) => arg.startsWith("--target"));
  const value = flag?.includes("=") ? flag.split("=")[1] : argv[argv.indexOf(flag) + 1];
  if (value !== "external" && value !== "internal") {
    console.error("Usage: verify-output.mjs --target external|internal");
    process.exit(1);
  }
  return value;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

function walkDocs(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDocs(abs, base, out);
    else out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out;
}

const TEXT_EXTENSIONS = new Set([".html", ".json", ".xml", ".txt", ".js"]);

// Generic filenames are too weak a signal on their own — "README.md" or
// "index.md" will legitimately appear inside unrelated evidence/log JSON.
// Only ever match on these as full relative paths, never as bare basenames.
const GENERIC_BASENAMES = new Set(["readme.md", "readme.mdx", "index.md", "index.mdx"]);

function bannedTokens() {
  const docsFiles = walkDocs(DOCS_ROOT);
  const tokens = new Set();

  for (const relPath of docsFiles) {
    if (isCustomer(relPath)) {
      tokens.add(relPath);
      const base = path.posix.basename(relPath);
      if (!GENERIC_BASENAMES.has(base.toLowerCase())) tokens.add(base);
    }
  }

  if (target === "external") {
    for (const relPath of docsFiles) {
      if (isForcedInternal(relPath)) {
        const base = path.posix.basename(relPath).replace(/\.mdx?$/i, "");
        if (!GENERIC_BASENAMES.has(base.toLowerCase())) tokens.add(base);
        tokens.add(relPath);
      }
    }
    tokens.add("server/db/ddl");
  }

  return [...tokens].filter(Boolean);
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error(`[verify-output:${target}] dist/ not found at ${DIST} — did astro build run?`);
    process.exit(1);
  }

  const tokens = bannedTokens();
  const files = walk(DIST).filter((f) => TEXT_EXTENSIONS.has(path.extname(f).toLowerCase()));

  const hits = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const token of tokens) {
      if (content.includes(token)) {
        hits.push({ file: path.relative(DIST, file), token });
      }
    }
  }

  if (hits.length) {
    console.error(
      `[verify-output:${target}] ${hits.length} excluded-content leak(s) found in dist/:`
    );
    for (const hit of hits) console.error(`  - "${hit.token}" in ${hit.file}`);
    process.exit(1);
  }

  console.log(
    `[verify-output:${target}] scanned ${files.length} file(s) against ${tokens.length} banned token(s) — clean.`
  );
}

main();
