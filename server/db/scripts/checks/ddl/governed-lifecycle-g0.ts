#!/usr/bin/env tsx

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface Surface {
  surface: string;
  owner: string;
  disposition: string;
  consumers: string[];
  usageMeasureSql: string;
  compatibilityWindow: string;
  removalGate: string;
}

const databaseRoot = resolve(import.meta.dirname, "../../..");
const repositoryRoot = resolve(databaseRoot, "../..");
const registryPath = resolve(
  databaseRoot,
  "ddl/planes/neon/governed-lifecycle-compatibility.v1.json",
);
const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
  schemaVersion: number;
  observationPolicy: string;
  surfaces: Surface[];
};
const failures: string[] = [];
if (registry.observationPolicy !== "evidence_checkpoint_no_fixed_duration")
  failures.push(
    "G0 must use the approved evidence-checkpoint observation policy",
  );
const required = [
  "document.business_partner_request family",
  "master.business_partner.aliases",
  "flattened Business Partner decision-scope columns",
  "document.workforce_iam_projection",
];

for (const name of required) {
  if (!registry.surfaces.some(({ surface }) => surface === name))
    failures.push(`missing compatibility surface: ${name}`);
}
for (const surface of registry.surfaces) {
  for (const field of [
    "owner",
    "disposition",
    "usageMeasureSql",
    "compatibilityWindow",
    "removalGate",
  ] as const) {
    if (!surface[field]?.trim())
      failures.push(`${surface.surface} has no ${field}`);
  }
  if (
    !/^SELECT\s/i.test(surface.usageMeasureSql) ||
    /;\s*\S/.test(surface.usageMeasureSql)
  ) {
    failures.push(
      `${surface.surface} usage measure must be one read-only SELECT`,
    );
  }
  if (surface.consumers.length === 0)
    failures.push(`${surface.surface} has no inventoried consumer`);
  for (const consumer of surface.consumers) {
    try {
      await access(resolve(repositoryRoot, consumer));
    } catch {
      failures.push(`${surface.surface} consumer does not exist: ${consumer}`);
    }
  }
}

const tables = await readFile(
  resolve(databaseRoot, "ddl/planes/neon/document/03_tables.sql"),
  "utf8",
);
const functions = await readFile(
  resolve(databaseRoot, "ddl/planes/neon/document/07_functions.sql"),
  "utf8",
);
for (const token of [
  "payload_schema_code",
  "payload_schema_version",
  "payload_schema_hash",
]) {
  if (!tables.includes(token))
    failures.push(`request form-definition pin is missing ${token}`);
  if (!functions.includes(`NEW.${token} IS DISTINCT FROM OLD.${token}`))
    failures.push(`submitted request may mutate ${token}`);
}
if (!tables.includes("CREATE TABLE document.workforce_iam_projection"))
  failures.push("workforce IAM projection remains migration-only");

if (failures.length) {
  failures.forEach((failure) => process.stderr.write(`FAIL ${failure}\n`));
  process.exitCode = 1;
} else {
  process.stdout.write(
    `PASS ${registry.surfaces.length} G0 compatibility surfaces have owners, consumers, executable measures, windows and removal gates\n`,
  );
  process.stdout.write(
    "PASS request form-definition code/version/hash pins are immutable after submission\n",
  );
  process.stdout.write(
    "PASS workforce IAM projection has canonical supported-upgrade parity\n",
  );
}
