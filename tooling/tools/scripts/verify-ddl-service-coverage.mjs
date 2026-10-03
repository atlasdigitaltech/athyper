import { readFile, readdir, stat } from "node:fs/promises";
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
    await verifyFeatureGateReferences(actual, root, errors);
  }

  if (errors.length) throw new Error(`DDL service coverage verification failed:\n- ${errors.join("\n- ")}`);
  return {
    rows: actual.rows.length,
    classifiedAndOwned: actual.summary.classifiedAndOwned,
    coveragePercent: actual.summary.coveragePercent,
    reviewRequired: actual.summary.reviewRequired,
    implementationEvidenceRecorded: actual.summary.implementationEvidenceRecorded,
    testEvidenceRecorded: actual.summary.testEvidenceRecorded,
  };
}

/** Check the host's configuration declaration and composition consumer. This is
 * source wiring evidence, not proof that a gate is enabled on a deployment. */
export async function verifyFeatureGateReferences(artifact, root, errors) {
  const gates = [...new Set(artifact.rows.map(row => row.featureGate).filter(Boolean))];
  if (!gates.length) return;
  const configPath = resolve(root, "server/apps/platform-host/src/config/environment.ts");
  const configuration = await readFile(configPath, "utf8");
  const bindings = new Map([...configuration.matchAll(/\b(\w+)\s*:\s*read(?:Boolean|Choice)\(\s*"([A-Z][A-Z0-9_]+)"/g)]
    .map(match => [match[2], match[1]]));
  const composition = await compositionSource(resolve(root, "server/apps/platform-host/src/composition"));
  for (const gate of gates) {
    const binding = bindings.get(gate);
    if (!binding) errors.push(`featureGate ${gate} has no host configuration declaration`);
    else if (!new RegExp(`\\b${binding}\\b`).test(composition)) errors.push(`featureGate ${gate} has no host composition consumer (${binding})`);
  }
}

async function compositionSource(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = await Promise.all(entries.map(async entry => {
    if (entry.name === "__tests__") return "";
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return compositionSource(path);
    if (!entry.name.endsWith(".ts") || /\.(test|spec)\.ts$/.test(entry.name)) return "";
    return readFile(path, "utf8");
  }));
  return sources.join("\n");
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
  console.log(`Recorded implementation references: ${result.implementationEvidenceRecorded}; test references: ${result.testEvidenceRecorded}. Reference presence is not executed qualification.`);
  } catch (error) {
    const lines = String(error.stack ?? error.message).split("\n");
    console.error(lines.slice(0, 102).join("\n"));
    if (lines.length > 102) console.error(`- ... ${lines.length - 102} additional issues omitted`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await main();
