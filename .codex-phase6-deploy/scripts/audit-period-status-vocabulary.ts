#!/usr/bin/env tsx
/**
 * Audits period lifecycle status values before enabling/enforcing status CHECKs.
 */

import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

interface InvalidStatusRow {
  table_name: string;
  status: string | null;
  count: string;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const res = await pool.query<InvalidStatusRow>(`
      WITH invalids AS (
        SELECT 'master.fiscal_period' AS table_name, status, count(*)::text AS count
          FROM master.fiscal_period
         WHERE status NOT IN ('future', 'open', 'soft_close', 'hard_close')
         GROUP BY status
        UNION ALL
        SELECT 'governance.book_period_status' AS table_name, status, count(*)::text AS count
          FROM governance.book_period_status
         WHERE status NOT IN ('future', 'open', 'soft_close', 'hard_close')
         GROUP BY status
      )
      SELECT * FROM invalids
      ORDER BY table_name, status NULLS FIRST
    `);

    if (res.rows.length === 0) {
      console.log("period status vocabulary audit OK - no invalid statuses.");
      return;
    }

    console.error("period status vocabulary audit FAILED:");
    for (const row of res.rows) {
      console.error(`  ${row.table_name}: status=${row.status ?? "null"} count=${row.count}`);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("audit-period-status-vocabulary failed:", err);
  process.exit(1);
});
