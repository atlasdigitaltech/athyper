import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const ignored = new Set(["node_modules", ".git", "dist", ".next", "build", ".turbo", "coverage"]);
const rel = (path) => relative(root, path).replaceAll("\\", "/");

function walk(directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(path));
    else result.push(path);
  }
  return result;
}

function activeWorkspacePaths() {
  const output = process.platform === "win32"
    ? execFileSync("powershell.exe", ["-NoProfile", "-Command", "pnpm list -r --depth -1 --json"], { cwd: root, encoding: "utf8" })
    : execFileSync("pnpm", ["list", "-r", "--depth", "-1", "--json"], { cwd: root, encoding: "utf8" });
  return new Set(JSON.parse(output).map((row) => rel(row.path)));
}

const active = activeWorkspacePaths();
const candidateRoots = [join(root, "packages", "shared"), join(root, "packages", "product-deprecated")];
const manifests = candidateRoots.flatMap((directory) => walk(directory)).filter((path) => path.endsWith("package.json"));
const trackedFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean).map((path) => resolve(root, path)).filter((path) => existsSync(path));
const files = trackedFiles.filter((path) => /\.(?:ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|md|sql)$/.test(path) || /Dockerfile(?:\..*)?$/.test(path));
const candidates = [];

for (const manifestPath of manifests) {
  if (!existsSync(manifestPath)) continue;
  const directory = resolve(manifestPath, "..");
  const path = rel(directory);
  if (active.has(path) || !(path.startsWith("packages/shared/") || path.startsWith("packages/product-deprecated/"))) continue;
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { continue; }
  const name = manifest.name ?? path;
  const references = [];
  const pathTokens = [path, `${path}/`];
  for (const file of files) {
    if (file.startsWith(`${directory}${"\\"}`) || file === manifestPath) continue;
    const content = readFileSync(file, "utf8");
    if (content.includes(name) || pathTokens.some((token) => content.includes(token))) references.push(rel(file));
  }
  candidates.push({
    packageName: name,
    path,
    replacementRequired: name,
    externalReferences: [...new Set(references)].sort(),
    deletionEligible: references.length === 0,
  });
}

candidates.sort((a, b) => a.path.localeCompare(b.path));
const report = {
  generatedAt: new Date().toISOString(),
  activeWorkspaceProjects: active.size,
  candidateCount: candidates.length,
  deletionEligibleCount: candidates.filter((item) => item.deletionEligible).length,
  candidates,
  requiredGates: [
    "pnpm install --frozen-lockfile",
    "pnpm build",
    "pnpm db:reset (full reset command for the deployment environment)",
    "server and application smoke tests",
    "pnpm policy:release-boundaries",
    "pnpm --dir server run meta:hygiene",
  ],
};
writeFileSync(join(root, "docs", "architecture", "phase-10-deletion-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
const lines = [
  "# Phase 10 — Final deletion audit",
  "",
  `Generated: ${report.generatedAt}`,
  `Active workspace projects: ${report.activeWorkspaceProjects}`,
  `Inactive duplicate/legacy candidates: ${report.candidateCount}`,
  `Reference-free candidates (pre-gate): ${report.deletionEligibleCount}`,
  "",
  "> Reference-free is necessary but not sufficient. A candidate may be deleted only after the full build, database reset, hygiene, and smoke gates pass, and after its complete tree is backed up outside the repository.",
  "",
  "| Package | Path | External references | Pre-gate status |",
  "|---|---|---:|---|",
  ...candidates.map((item) => `| ${item.packageName} | ${item.path} | ${item.externalReferences.length} | ${item.deletionEligible ? "Reference-free; gate required" : "Blocked; references remain"} |`),
];
writeFileSync(join(root, "docs", "architecture", "phase-10-deletion-audit.md"), `${lines.join("\n")}\n`);
console.log(`Phase 10 deletion audit written: ${candidates.length} candidates; ${report.deletionEligibleCount} reference-free before acceptance gates.`);
