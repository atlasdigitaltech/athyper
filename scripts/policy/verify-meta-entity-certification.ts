import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateMetaEntityCertification,
  validateCertificationDefinition,
  type MetaEntityCertificationDefinition,
  type MetaEntityCertificationSnapshot,
} from "./meta-entity-certification";

const definitionPath = resolve(
  "config/governance/meta-entity-certification.json",
);
const definition = JSON.parse(
  readFileSync(definitionPath, "utf8"),
) as MetaEntityCertificationDefinition;
const definitionFailures = validateCertificationDefinition(definition);
if (definitionFailures.length > 0) {
  definitionFailures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}

const snapshotArg = process.argv.find((arg) => arg.startsWith("--snapshot="));
if (!snapshotArg) {
  console.log(
    `PASS certification definition: ${definition.requiredCriteria.length} criteria, `
    + `${definition.gates.length} dependency gates.`,
  );
  process.exit(0);
}

const snapshotPath = resolve(snapshotArg.slice("--snapshot=".length));
const snapshot = JSON.parse(
  readFileSync(snapshotPath, "utf8"),
) as MetaEntityCertificationSnapshot;
const decision = evaluateMetaEntityCertification(definition, snapshot);
console.log(JSON.stringify(decision, null, 2));
if (decision.decision !== "CERTIFIED") process.exit(1);
