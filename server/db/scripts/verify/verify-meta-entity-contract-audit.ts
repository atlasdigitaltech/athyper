#!/usr/bin/env tsx
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");
const failOnWarning = process.argv.includes("--fail-on-warning");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const relation = await client.query<{ present: boolean }>(
    "SELECT to_regclass('control.v_meta_entity_contract_audit') IS NOT NULL AS present",
  );
  if (!relation.rows[0]?.present) throw new Error("M7 unified Contract audit view is missing.");
  const result = await client.query<{
    entity_code: string;
    tenant_id: string | null;
    severity: "CRITICAL" | "HIGH" | "WARN" | "INFO";
    remediation_guidance: string;
  }>(`
    SELECT entity_code, tenant_id::text, severity, remediation_guidance
      FROM control.v_meta_entity_contract_audit
     WHERE severity IN ('CRITICAL','HIGH'${failOnWarning ? ",'WARN'" : ""})
     ORDER BY
       CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,
       tenant_id NULLS FIRST,
       entity_code
  `);
  for (const row of result.rows) {
    process.stderr.write(
      `${row.severity} ${row.tenant_id ?? "platform"}/${row.entity_code}: ${row.remediation_guidance}\n`,
    );
  }
  if (result.rows.length > 0) {
    throw new Error(`${result.rows.length} blocking Meta Entity Contract audit finding(s).`);
  }
  process.stdout.write("PASS unified Meta Entity Contract audit has no blocking findings.\n");
} finally {
  await client.end();
}
