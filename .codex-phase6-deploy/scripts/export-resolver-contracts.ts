#!/usr/bin/env tsx
/**
 * Resolver Contracts Export
 *
 * Dumps the registered resolver contracts to
 * `server/db/seed/_generated/resolver-contracts.json` so the cascade-rule
 * verifier can validate `on_source_change[].resolver` references without
 * booting the full server.
 *
 * Run after adding/removing/renaming a resolver:
 *   tsx server/scripts/export-resolver-contracts.ts
 *
 * Wired into the CI pipeline; commit the regenerated JSON alongside the
 * resolver change.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listResolverContracts, registerAllResolvers } from "@athyper/svc-shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const OUT_DIR    = path.join(__dirname, "..", "db", "seed", "_generated");
const OUT_FILE   = path.join(OUT_DIR, "resolver-contracts.json");

function main(): void {
  registerAllResolvers();

  const contracts = listResolverContracts();

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        contracts:    contracts.map((c) => ({
          code:            c.code,
          description:     c.description,
          requiredSources: c.requiredSources,
          outputType:      c.outputType,
          ...(c.targetEntity ? { targetEntity: c.targetEntity } : {}),
        })),
      },
      null,
      2,
    ) + "\n",
  );

  // eslint-disable-next-line no-console
  console.log(`Wrote ${contracts.length} resolver contracts to ${path.relative(process.cwd(), OUT_FILE)}`);
}

main();
