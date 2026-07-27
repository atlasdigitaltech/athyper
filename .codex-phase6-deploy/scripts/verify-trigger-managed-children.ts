#!/usr/bin/env tsx
/**
 * CI drift check for control.entity.feature_flags.trigger_managed_children.
 *
 * Fails when a claimed trigger_name / refresh_trigger is not present in
 * pg_trigger. Service-owned entries (trigger_name=NULL) are skipped here.
 *
 * Usage:
 *   DATABASE_URL=postgres://athyperadmin:athyperadmin@127.0.0.1:5432/athyper \
 *     npx tsx server/scripts/verify-trigger-managed-children.ts
 *
 * Exit code:
 *   0 — all claimed triggers exist
 *   1 — at least one is missing (CI red)
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

interface ClaimRow {
  entity_code:      string;
  trigger_name:     string | null;
  refresh_trigger:  string | null;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const { rows } = await pool.query<ClaimRow>(`
      SELECT e.entity_code,
             child.value ->> 'trigger_name'    AS trigger_name,
             child.value ->> 'refresh_trigger' AS refresh_trigger
        FROM control.entity e
        CROSS JOIN LATERAL jsonb_array_elements(e.feature_flags -> 'trigger_managed_children') AS child(value)
       WHERE e.tenant_id IS NULL
         AND e.feature_flags ? 'trigger_managed_children'
    `);

    const claimed = new Set<string>();
    for (const r of rows) {
      if (r.trigger_name)    claimed.add(r.trigger_name);
      if (r.refresh_trigger) claimed.add(r.refresh_trigger);
    }

    if (claimed.size === 0) {
      console.log("✓ trigger_managed_children: no trigger claims to verify (all service-owned)");
      return;
    }

    const claimedArr = [...claimed];
    const existing = await pool.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE tgname = ANY($1::text[])`,
      [claimedArr],
    );
    const existingSet = new Set(existing.rows.map(r => r.tgname));
    const missing = claimedArr.filter(t => !existingSet.has(t));

    if (missing.length > 0) {
      console.error(`✗ trigger_managed_children drift: missing triggers: ${missing.join(", ")}`);
      process.exit(1);
    }
    console.log(`✓ trigger_managed_children: ${claimed.size} claimed trigger(s) all present`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
