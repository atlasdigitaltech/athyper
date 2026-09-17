#!/usr/bin/env node
// Shared staging pipeline for apps/docs-external and apps/docs-internal.
// Reads docs/, classifies each file by the publication rules in
// tooling/scripts/docs/lib/classify.mjs, and copies eligible content into
// the target app's src/content/docs/ (pages) and public/assets/ (downloads).
//
// Usage: node stage-content.mjs --target external|internal [--empty]
//
// --empty skips classification entirely and stages only the placeholder
// page, regardless of target. Used for the harmless-placeholder Cloudflare
// Pages + Access verification deploy (see the docs deployment runbook) so
// that pass can ship a real Starlight build (with a real Pagefind index and
// sitemap to test Access against) without any real docs/ content in it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isEligible, isCustomer, isForcedInternal } from "./lib/classify.mjs";
import { parseFrontmatter, stringifyFrontmatter, firstHeading } from "./lib/frontmatter.mjs";
import { stagedRelPath, toHref, toAssetHref, rewriteLinks } from "./lib/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DOCS_ROOT = path.join(REPO_ROOT, "docs");

// Kept in sync with the plane list in apps/docs-external/src/components/SiteTitle.astro.
const PLANES = [
  { dir: "neon", name: "Neon" },
  { dir: "mesh", name: "Mesh" },
  { dir: "studio", name: "Studio" },
];

const target = parseTarget(process.argv);
const empty = process.argv.includes("--empty");
const APP_DIR = path.join(REPO_ROOT, "apps", `docs-${target}`);
const CONTENT_OUT = path.join(APP_DIR, "src", "content", "docs");
const ASSETS_OUT = path.join(APP_DIR, "public", "assets");
const MANIFEST_OUT = path.join(APP_DIR, ".docs-manifest.json");

function parseTarget(argv) {
  const flag = argv.find((arg) => arg.startsWith("--target"));
  const value = flag?.includes("=") ? flag.split("=")[1] : argv[argv.indexOf(flag) + 1];
  if (value !== "external" && value !== "internal") {
    console.error('Usage: stage-content.mjs --target external|internal');
    process.exit(1);
  }
  return value;
}

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, base, out);
    } else if (entry.isFile()) {
      out.push(path.relative(base, abs).split(path.sep).join("/"));
    }
  }
  return out;
}

function isMarkdown(relPath) {
  return /\.mdx?$/i.test(relPath);
}

function main() {
  fs.rmSync(CONTENT_OUT, { recursive: true, force: true });
  fs.rmSync(ASSETS_OUT, { recursive: true, force: true });
  fs.mkdirSync(CONTENT_OUT, { recursive: true });

  if (empty) {
    writePlaceholder();
    writeManifest([], []);
    console.log(`[stage-content:${target}] --empty: staged placeholder only.`);
    return;
  }

  const allFiles = walk(DOCS_ROOT);
  const markdownFiles = allFiles.filter(isMarkdown);

  // Pass 1: classify and parse every markdown file up front so link
  // rewriting (pass 2) knows the full staged set before touching bodies.
  const records = new Map(); // relPath -> { data, body, eligible, titleSource }
  for (const relPath of markdownFiles) {
    const raw = fs.readFileSync(path.join(DOCS_ROOT, relPath), "utf8");
    const { data, body } = parseFrontmatter(raw);
    const eligible = isEligible(relPath, data, target);
    records.set(relPath, { data, body, eligible });
  }

  const stagedSet = new Set(
    [...records.entries()].filter(([, r]) => r.eligible).map(([relPath]) => relPath)
  );

  const violations = [];
  const warnings = [];
  const referencedAssets = new Set();
  const manifestEntries = [];

  function resolveLink(sourceRelPath) {
    return (resolvedRelPath, isMd) => {
      if (resolvedRelPath.startsWith("..")) {
        // Escapes docs/ entirely (e.g. into server/db/, architecture/ outside docs).
        if (target === "external") {
          violations.push(
            `${sourceRelPath}: link escapes docs/ boundary -> ${resolvedRelPath}`
          );
        } else {
          warnings.push(`${sourceRelPath}: relative link leaves docs/ (${resolvedRelPath}), left as-is`);
        }
        return null;
      }

      if (isCustomer(resolvedRelPath)) {
        violations.push(`${sourceRelPath}: links into excluded docs/customer/ -> ${resolvedRelPath}`);
        return null;
      }

      if (isMd) {
        if (stagedSet.has(resolvedRelPath)) {
          return toHref(resolvedRelPath);
        }
        if (target === "external") {
          violations.push(
            `${sourceRelPath}: links to unapproved content -> ${resolvedRelPath} (not audience: public)`
          );
        } else {
          warnings.push(`${sourceRelPath}: links to missing file -> ${resolvedRelPath}`);
        }
        return null;
      }

      const absTarget = path.join(DOCS_ROOT, resolvedRelPath);
      if (!fs.existsSync(absTarget)) {
        warnings.push(`${sourceRelPath}: referenced path does not exist -> ${resolvedRelPath}`);
        return null;
      }

      if (fs.statSync(absTarget).isDirectory()) {
        // A directory link (e.g. "../architecture/") resolves to that
        // directory's README/index, if one was staged.
        const indexRelPath = `${resolvedRelPath}/README.md`;
        if (stagedSet.has(indexRelPath)) {
          return toHref(indexRelPath);
        }
        if (target === "external") {
          violations.push(
            `${sourceRelPath}: links to unapproved directory -> ${resolvedRelPath} (no staged README)`
          );
        } else {
          warnings.push(`${sourceRelPath}: links to directory with no README -> ${resolvedRelPath}`);
        }
        return null;
      }

      // Non-markdown asset (csv/xlsx/image) referenced from a staged page.
      referencedAssets.add(resolvedRelPath);
      return toAssetHref(resolvedRelPath);
    };
  }

  // Pass 2: transform and write staged pages.
  for (const [relPath, record] of records) {
    if (!record.eligible) continue;
    const { data, body } = record;

    const title = data.title || firstHeading(body) || filenameToTitle(relPath);
    const frontmatter = { ...data, title };
    const transformedBody = rewriteLinks(body, relPath, resolveLink(relPath));

    const outRelPath = stagedRelPath(relPath);
    const outAbsPath = path.join(CONTENT_OUT, outRelPath);
    fs.mkdirSync(path.dirname(outAbsPath), { recursive: true });
    fs.writeFileSync(outAbsPath, stringifyFrontmatter(frontmatter) + "\n" + transformedBody);

    manifestEntries.push({
      source: `docs/${relPath}`,
      staged: outRelPath,
      href: toHref(relPath),
      audience: data.audience ?? (target === "internal" ? "internal (default)" : undefined),
      reviewedBy: data.reviewed_by,
      reviewedDate: data.reviewed_date,
      forcedInternal: isForcedInternal(relPath),
    });
  }

  if (manifestEntries.length === 0) {
    // Keeps the site deployable (and testable against gate #3 — Access
    // must deny unauthenticated access before real content ever lands)
    // even before any docs/ file is approved for this target.
    writePlaceholder();
  }

  if (target === "external") {
    // The header's Neon/Mesh/Studio plane switcher (src/components/
    // SiteTitle.astro) always links to /neon/, /mesh/, /studio/ — stub
    // each one out until real audience: public content lands under it,
    // so the switcher never 404s.
    for (const plane of PLANES) {
      const hasContent = manifestEntries.some((e) => e.href.startsWith(`/${plane.dir}`));
      if (hasContent) continue;
      const outAbsPath = path.join(CONTENT_OUT, plane.dir, "index.md");
      fs.mkdirSync(path.dirname(outAbsPath), { recursive: true });
      fs.writeFileSync(
        outAbsPath,
        stringifyFrontmatter({ title: `athyper ${plane.name}` }) +
          "\n" +
          `No public documentation has been published for ${plane.name} yet.\n`
      );
    }
  }

  // Copy assets referenced by staged pages.
  for (const assetRelPath of referencedAssets) {
    const srcAbs = path.join(DOCS_ROOT, assetRelPath);
    const destAbs = path.join(ASSETS_OUT, assetRelPath);
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });
    fs.copyFileSync(srcAbs, destAbs);
  }

  writeManifest(manifestEntries, warnings, referencedAssets.size);

  if (warnings.length) {
    console.warn(`[stage-content:${target}] ${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }

  console.log(
    `[stage-content:${target}] staged ${manifestEntries.length} page(s), ${referencedAssets.size} asset(s).`
  );

  if (violations.length) {
    console.error(`[stage-content:${target}] ${violations.length} publication-boundary violation(s):`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
}

function writePlaceholder() {
  fs.writeFileSync(
    path.join(CONTENT_OUT, "index.md"),
    stringifyFrontmatter({ title: "athyper Docs" }) +
      "\n" +
      "No content has been published for this site yet.\n"
  );
}

function writeManifest(entries, warnings, assetCount) {
  fs.writeFileSync(
    MANIFEST_OUT,
    JSON.stringify(
      {
        target,
        empty,
        generatedAt: new Date().toISOString(),
        stagedCount: entries.length,
        assetCount,
        warnings,
        entries,
      },
      null,
      2
    )
  );
}

function filenameToTitle(relPath) {
  const base = path.posix.basename(relPath).replace(/\.mdx?$/i, "");
  return base
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

main();
