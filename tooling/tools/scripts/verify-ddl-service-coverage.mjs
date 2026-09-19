import { readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import {
  EVIDENCE_FIELDS,
  SCHEMA_VERSION,
  buildCoverageArtifact,
  outputPath,
  repositoryRoot,
  renderArtifact,
  schemaPath,
  validateCoverageArtifact,
} from "./generate-ddl-service-coverage.mjs";
import { validateCoverage } from "./ddl-service-coverage-policy.mjs";

export async function verifyCoverage(options = {}) {
  const root = options.root ?? repositoryRoot;
  const artifactPath = options.outputPath ?? outputPath;
  const expected = options.expected ?? await buildCoverageArtifact(options);
  const errors = [];

  const schema = JSON.parse(await readFile(options.schemaPath ?? schemaPath, "utf8"));
  if (schema?.properties?.schemaVersion?.const !== SCHEMA_VERSION) errors.push(`Schema version constant must be ${SCHEMA_VERSION}`);

  let actual;
  let actualText = "";
  try {
    actualText = await readFile(artifactPath, "utf8");
    actual = JSON.parse(actualText);
  } catch (error) {
    errors.push(`Cannot read generated inventory: ${error.message}`);
  }

  if (actual) {
    try { validateCoverageArtifact(actual); } catch (error) { errors.push(error.message); }
    if (actualText !== renderArtifact(expected)) errors.push("Generated inventory is stale; run ddl:coverage:generate");
    if (options.strict) errors.push(...await validateCoverage(actual, { root }));
    await verifyEvidenceReferences(actual, root, errors);
  }

  if (errors.length) throw new Error(`DDL service coverage verification failed:\n- ${errors.join("\n- ")}`);
  return {
    rows: actual.rows.length,
    classifiedAndOwned: actual.summary.classifiedAndOwned,
    coveragePercent: actual.summary.coveragePercent,
    reviewRequired: actual.summary.reviewRequired,
  };
}

export async function verifyEvidenceReferences(artifact, root, errors) {
  const checked = new Map();
  for (const row of artifact.rows) {
    for (const field of EVIDENCE_FIELDS) {
      for (const reference of row[field]) {
        const target = resolve(root, reference);
        const relativeTarget = portable(relative(root, target));
        const insideRoot = relativeTarget !== ".." && !relativeTarget.startsWith("../") && !resolve(relativeTarget).startsWith("\\\\");
        if (!checked.has(reference)) checked.set(reference, insideRoot ? await stat(target).catch(() => undefined) : undefined);
        const targetStat = checked.get(reference);
        const isTestField = field === "unitTests" || field === "postgresTests";
        const exists = Boolean(targetStat) && (!isTestField || (targetStat.isFile() && /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(reference)));
        if (!exists) errors.push(`${row.sourceKey} ${field} references missing, external, or non-test path ${reference}`);
      }
    }
  }
}

function portable(path) { return path.split(sep).join("/"); }

async function main() {
  try {
    const strict = process.argv.includes("--strict");
    const result = await verifyCoverage({ strict });
  console.log(`Verified ${result.rows} physical DDL tables; ownership coverage ${result.coveragePercent}% (${result.classifiedAndOwned}/${result.rows}); ${result.reviewRequired} remain provisional.`);
  } catch (error) {
    const lines = String(error.stack ?? error.message).split("\n");
    console.error(lines.slice(0, 102).join("\n"));
    if (lines.length > 102) console.error(`- ... ${lines.length - 102} additional issues omitted`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await main();
