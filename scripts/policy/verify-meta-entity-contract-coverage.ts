import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  META_ENTITY_COVERAGE_ARTIFACT,
  buildMetaEntityCoverageArtifact,
  readCommittedMetaEntityCoverageArtifact,
  serializeMetaEntityCoverageArtifact,
  validateMetaEntityCoverageArtifact,
} from "./meta-entity-contract-coverage";

const root = process.cwd();
const update = process.argv.includes("--update");
const strict = process.argv.includes("--strict");
const generated = buildMetaEntityCoverageArtifact();
const errors = validateMetaEntityCoverageArtifact(generated);

if (errors.length > 0) {
  for (const error of errors) console.error(`meta-entity-contract-coverage: ${error}`);
  process.exit(1);
}

const serialized = serializeMetaEntityCoverageArtifact(generated);
if (update) {
  writeFileSync(resolve(root, META_ENTITY_COVERAGE_ARTIFACT), serialized);
  console.log(
    `meta-entity-contract-coverage: updated ${META_ENTITY_COVERAGE_ARTIFACT} `
    + `(${generated.summary.totalCoverageRows} rows).`,
  );
  process.exit(0);
}

let committed: string;
try {
  committed = serializeMetaEntityCoverageArtifact(
    readCommittedMetaEntityCoverageArtifact(root),
  );
} catch (error) {
  console.error(`meta-entity-contract-coverage: cannot read committed artifact: ${String(error)}`);
  process.exit(1);
}

if (committed !== serialized) {
  console.error(
    "meta-entity-contract-coverage: generated ledger differs from the committed artifact. "
    + "Run 'pnpm policy:meta-entity-contract:update' after reviewing the Contract change.",
  );
  process.exit(1);
}

if (strict && generated.summary.wiringBlockedRows > 0) {
  console.error(
    `meta-entity-contract-coverage: ${generated.summary.wiringBlockedRows} rows remain blocked for v2.1.`,
  );
  process.exit(1);
}

console.log(
  `meta-entity-contract-coverage: ${generated.summary.registryEntries} registry entries, `
  + `${generated.summary.schemaNodes} schema nodes, `
  + `${generated.summary.totalCoverageRows} coverage rows, `
  + `${generated.summary.wiringBlockedRows} v2.1 wiring gaps.`,
);
