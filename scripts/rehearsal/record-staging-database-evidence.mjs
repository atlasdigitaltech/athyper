#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defaultRepoRoot } from "../../deploy/stackctl/src/io.mjs";
import {
  recordPreMigrationBackupEvidence,
  recordRestoreDrillEvidence,
} from "../../deploy/stackctl/src/rehearsal-evidence.mjs";

function usage() {
  return `Usage:
  record-staging-database-evidence.mjs backup --manifest <backup.json> --output <pre-migration-backup.json>
  record-staging-database-evidence.mjs restore --manifest <backup.json> --backup-evidence <pre-migration-backup.json> --receipt <restore-receipt.json> --output <restore-drill.json>`;
}

function parse(values) {
  const [operation, ...rest] = values;
  if (!["backup", "restore"].includes(operation)) throw new Error(usage());
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) throw new Error(usage());
    options[flag.slice(2)] = resolve(value);
  }
  for (const key of operation === "backup"
    ? ["manifest", "output"]
    : ["manifest", "backup-evidence", "receipt", "output"]) {
    if (!options[key]) throw new Error(`--${key} is required\n${usage()}`);
  }
  return { operation, options };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { operation, options } = parse(process.argv.slice(2));
    if (operation === "backup") {
      recordPreMigrationBackupEvidence(defaultRepoRoot, options.manifest, options.output);
    } else {
      recordRestoreDrillEvidence(
        defaultRepoRoot,
        options.manifest,
        options["backup-evidence"],
        options.receipt,
        options.output,
      );
    }
    process.stdout.write(`Recorded schema-valid ${operation} evidence at ${options.output}.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
