#!/usr/bin/env tsx
/**
 * CI drift check for server/db/seed/contracts/generated/resolver-contracts.json.
 *
 * (1) The exported JSON file must match the runtime registry (register all
 *     resolvers, then compare code sets).
 * (2) Every entity_field.defaults.on_source_change[].resolver reference must
 *     resolve to a registered contract code.
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-resolver-contracts.ts
 *
 * Exit code:
 *   0 — file matches registry AND all field references valid
 *   1 — drift detected (CI red)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { listResolverContracts, registerAllResolvers } from "@athyper/svc-shared";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const CONTRACTS_FILE = path.join(
  __dirname, "..", "db", "seed", "contracts", "generated", "resolver-contracts.json",
);

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

interface JsonContract {
  code: string;
}
interface JsonFile {
  generated_at: string;
  contracts:    JsonContract[];
}

async function main(): Promise<void> {
  // (1) Registry vs file
  registerAllResolvers();
  const registered = new Set(listResolverContracts().map(c => String(c.code)));

  if (!fs.existsSync(CONTRACTS_FILE)) {
    console.error(`✗ ${CONTRACTS_FILE} missing. Run: tsx server/scripts/export-resolver-contracts.ts`);
    process.exit(1);
  }
  const onDisk = JSON.parse(fs.readFileSync(CONTRACTS_FILE, "utf8")) as JsonFile;
  const fileCodes = new Set(onDisk.contracts.map(c => c.code));

  const missingInFile   = [...registered].filter(c => !fileCodes.has(c));
  const missingInReg    = [...fileCodes].filter(c => !registered.has(c));
  if (missingInFile.length > 0 || missingInReg.length > 0) {
    console.error("✗ resolver-contracts.json is out of date");
    if (missingInFile.length > 0) console.error(`  registered but not in file: ${missingInFile.join(", ")}`);
    if (missingInReg.length > 0)  console.error(`  in file but not registered: ${missingInReg.join(", ")}`);
    console.error("  Run: tsx server/scripts/export-resolver-contracts.ts");
    process.exit(1);
  }

  // (2) DB references
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const { rows } = await pool.query<{ code: string | null }>(`
      SELECT DISTINCT (jsonb_array_elements(ef.defaults -> 'on_source_change') ->> 'resolver') AS code
        FROM control.entity_field ef
       WHERE ef.defaults ? 'on_source_change'
    `);
    const bad = rows
      .map(r => r.code)
      .filter((c): c is string => typeof c === "string" && c.length > 0 && !registered.has(c));

    if (bad.length > 0) {
      console.error(`✗ entity_field.defaults references unregistered resolvers: ${[...new Set(bad)].join(", ")}`);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }

  console.log(`✓ resolver-contracts: ${registered.size} registered, JSON matches, all field references valid`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
