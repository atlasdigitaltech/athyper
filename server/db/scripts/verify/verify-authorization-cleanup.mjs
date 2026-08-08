import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import process from "node:process";

const dbRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(dbRoot, "../..");
const runtimeRoots = ["server/src", "server/packages", "packages", "apps"];
const seedRoot = "server/db/ddl";
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".prisma"]);

const retiredRuntimePatterns = [
  ["master workspace/module catalog", /master\.(?:workspace|module)\b/giu],
  ["tenant subscription-plan pointer", /\b(?:tenant|t)\.subscription_plan_id\b/giu],
  ["capability toggle", /\bcapability_toggle\b/giu],
  ["retired application projection name", /\b(?:organization_projection|tenant_application_projection|plane_application_projection)\b/giu],
];

const physicalRetirementPatterns = [
  ["master.workspace table", /CREATE\s+TABLE\s+master\.workspace\b/giu],
  ["master.module table", /CREATE\s+TABLE\s+master\.module\b/giu],
  ["master.tenant.subscription_plan_id column", /\bsubscription_plan_id\s+uuid\b/giu],
  ["capability_toggle object", /\bcapability_toggle\b/giu],
];

async function filesUnder(relativeRoot) {
  const absoluteRoot = resolve(repoRoot, relativeRoot);
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist", "build", "coverage", "generated"].includes(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (sourceExtensions.has(extname(entry.name))) files.push(path);
    }
  }
  await visit(absoluteRoot);
  return files;
}

async function scan(files, patterns, filter = () => true) {
  const findings = [];
  for (const file of files) {
    if (!filter(file)) continue;
    const content = await readFile(file, "utf8");
    for (const [label, pattern] of patterns) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) {
        const line = content.slice(0, match.index).split(/\r?\n/u).length;
        findings.push({ label, file: relative(repoRoot, file).replaceAll("\\", "/"), line });
      }
    }
  }
  return findings;
}

const runtimeFiles = (await Promise.all(runtimeRoots.map(filesUnder))).flat();
const ddlFiles = await filesUnder(seedRoot);
const seedFiles = ddlFiles.filter((file) => /(?:seed|fixture)/iu.test(relative(repoRoot, file)));
const runtimeFindings = await scan(runtimeFiles, retiredRuntimePatterns);
const seedFindings = await scan(seedFiles, retiredRuntimePatterns);
const physicalObjectFindings = await scan(
  ddlFiles,
  physicalRetirementPatterns.filter(([label]) => label !== "master.tenant.subscription_plan_id column"),
  (file) => !file.endsWith("verify-wave8-cleanup.mjs"),
);
const physicalColumnFindings = await scan(
  ddlFiles,
  physicalRetirementPatterns.filter(([label]) => label === "master.tenant.subscription_plan_id column"),
  (file) => /\/planes\/(?:athyper|neon|mesh)\/master\/03_tables\.sql$/u.test(file.replaceAll("\\", "/")),
);
const physicalFindings = [...physicalObjectFindings, ...physicalColumnFindings];

const runtimeOnly = process.argv.includes("--runtime-only");
const blocking = runtimeOnly
  ? runtimeFindings
  : [...runtimeFindings, ...seedFindings, ...physicalFindings];

for (const finding of blocking) {
  console.error(`${finding.file}:${finding.line}: ${finding.label}`);
}

if (blocking.length > 0) {
  console.error(`Wave 8 cleanup gate failed with ${blocking.length} retired-reference finding(s).`);
  process.exitCode = 1;
} else {
  console.log(`Wave 8 ${runtimeOnly ? "runtime" : "full"} cleanup gate passed.`);
}
