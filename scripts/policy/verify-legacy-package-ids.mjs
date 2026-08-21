#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const roots = [
  join(repoRoot, "packages", "apps"),
  join(repoRoot, "packages", "shared"),
  join(repoRoot, "server", "packages"),
];

const reportPath = process.argv.includes("--report")
  ? process.argv[process.argv.indexOf("--report") + 1]
  : null;

const ignoreDirs = new Set(["node_modules", ".turbo", "dist", ".next", ".git", "coverage"]);
const allowedExts = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".yml",
  ".yaml",
  ".md",
  ".txt",
  ".sql",
  ".env",
]);

const legacyPackageNames = new Set([
  "@athyper/svc-docservices",
  "@athyper/adapter-memorycache",
  "@athyper/adapter-objectstorage",
]);

const legacyPathSegments = new Set(["docservices", "memorycache", "objectstorage"]);

const violations = [];

function toPosix(value) {
  return value.split(sep).join("/");
}

function walk(root, handler) {
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (ignoreDirs.has(name)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, handler);
      continue;
    }

    const ext = full.slice(full.lastIndexOf(".")).toLowerCase();
    if (allowedExts.has(ext)) {
      handler(full);
    }
  }
}

function push(type, file, line, column, detail, suggestion = null) {
  violations.push({
    type,
    file: toPosix(relative(repoRoot, file)),
    line,
    column,
    detail,
    suggestion,
  });
}

function lineCol(text, index) {
  const pre = text.slice(0, index);
  const line = pre.split(/\r?\n/).length;
  const last = pre.lastIndexOf("\n");
  const column = index - (last === -1 ? -1 : last);
  return { line, column };
}

function validateLiteral(file, text, literal, start) {
  const v = literal;

  if (legacyPackageNames.has(v)) {
    const { line, column } = lineCol(text, start);
    push("legacy-package", file, line, column, `legacy package id: ${v}`, `replace with canonical package id`);
    return;
  }

  const isPathLike = v.includes("/") || v.includes("\\") || v.includes("@");
  if (!isPathLike) return;
  if (v.startsWith("http://") || v.startsWith("https://")) return;

  const startsWithSlash = v.startsWith("/");
  const hasRouteApi = /^\/api\//.test(v);
  if (startsWithSlash && hasRouteApi) return;

  for (const segment of legacyPathSegments) {
    if (segment === "docservices") {
      if (new RegExp(`(^|[\\/])(docservices)(?=$|[\\/])`).test(v)) {
        if (startsWithSlash) return;
        const { line, column } = lineCol(text, start);
        push(
          "legacy-path-segment",
          file,
          line,
          column,
          `legacy package/path segment: ${segment}`,
          `use svc-doc-services and rename path segment to doc-services where package path references exist`
        );
      }
      continue;
    }

    if (new RegExp(`(^|[\\/])${segment}(?=$|[\\/])`).test(v) && !startsWithSlash) {
      const { line, column } = lineCol(text, start);
      push(
        "legacy-path-segment",
        file,
        line,
        column,
        `legacy package/path segment: ${segment}`,
        `rename path segment to ${segment === "memorycache" ? "memory-cache" : "object-storage"}`
      );
    }
  }
}

function scanTextLiterals(file, text) {
  const importSpecRegex = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|\b(?:vi|jest)\.mock\s*\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = importSpecRegex.exec(text)) !== null) {
    const spec = m[1] || m[2] || m[3];
    validateLiteral(file, text, spec, m.index);
  }

  const jsonStringRegex = /["']([^"'\\\n]|\\.)*["']/g;
  while ((m = jsonStringRegex.exec(text)) !== null) {
    const raw = m[0];
    const unquoted = raw.slice(1, -1).replace(/\\(["'`\\/bfnrtv])/g, "$1").replace(/\\u([0-9a-fA-F]{4})/g, () => "x");
    validateLiteral(file, text, unquoted, m.index);
  }
}

function scanPackageJson(file, text) {
  if (!file.endsWith("package.json")) return;
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    push("invalid-package-json", file, 1, 1, "unable to parse package.json");
    return;
  }

  const all = new Set();
  if (typeof pkg?.name === "string") all.add(pkg.name);
  for (const scope of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const obj = pkg?.[scope];
    if (obj && typeof obj === "object") {
      for (const key of Object.keys(obj)) {
        all.add(key);
      }
    }
  }

  for (const item of all) {
    validateLiteral(file, text, item, 0);
  }
}

for (const root of roots) {
  walk(root, (file) => {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      return;
    }

    scanPackageJson(file, text);
    if (file.endsWith(".json")) {
      // package-like files already parsed; still scan raw value strings for legacy path links
      scanTextLiterals(file, text);
    } else {
      scanTextLiterals(file, text);
    }
  });
}

const report = {
  generatedAtUtc: new Date().toISOString(),
  scope: roots.map((r) => toPosix(relative(repoRoot, r))),
  violations,
};

if (reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

if (violations.length > 0) {
  console.log("Legacy package identifiers/path segments found:");
  for (const v of violations.slice(0, 40)) {
    console.log(`- ${v.type}: ${v.file}:${v.line}:${v.column} => ${v.detail}`);
  }
  if (violations.length > 40) {
    console.log(`... plus ${violations.length - 40} more`);
  }
  process.exit(1);
}

console.log("Legacy package identifiers/path segment scan passed.");
