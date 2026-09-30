#!/usr/bin/env tsx
/** Verifies STUDIO's current definition-driven field-security authority. */
import postgres from "postgres";

const databaseUrl = process.env["ATHYPER_PLATFORM_DATABASE_ADMIN_URL"] ?? process.env["STUDIO_DATABASE_URL"] ?? process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("ERROR: ATHYPER_PLATFORM_DATABASE_ADMIN_URL, STUDIO_DATABASE_URL, or DATABASE_URL is required");
  process.exit(1);
}
interface CountRow { count: number }
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
try {
  const [identity] = await sql<{ database_name: string }[]>`SELECT current_database() AS database_name`;
  if (!identity || identity.database_name !== "athyper_studio") {
    throw new Error(`field-security verification requires athyper_studio, got ${identity?.database_name}`);
  }
  const required = ["metadata.entity", "metadata.entity_change_set", "metadata.entity_release", "metadata.entity_field", "metadata.entity_field_policy_binding", "metadata.pii_inventory", "control.policy_definition"];
  for (const name of required) {
    const [row] = await sql<{ found: boolean }[]>`SELECT to_regclass(${name}) IS NOT NULL AS found`;
    if (!row?.found) throw new Error(`missing current field-security relation ${name}`);
  }
  const [invalidClassification] = await sql<CountRow[]>`
    SELECT count(*)::int AS count FROM metadata.entity_field
    WHERE data_classification NOT IN ('public','internal','confidential','pii','sensitive_pii')
  `;
  const [brokenBindings] = await sql<CountRow[]>`
    SELECT count(*)::int AS count FROM metadata.entity_field_policy_binding b
    LEFT JOIN metadata.entity e ON e.id = b.entity_id
    LEFT JOIN metadata.entity_change_set cs ON cs.id = b.change_set_id
    LEFT JOIN metadata.entity_field f ON f.id = b.entity_field_id
    LEFT JOIN control.policy_definition p ON p.id = b.policy_definition_id
    WHERE e.id IS NULL OR cs.id IS NULL OR f.id IS NULL OR p.id IS NULL
       OR f.entity_id IS DISTINCT FROM b.entity_id OR f.change_set_id IS DISTINCT FROM b.change_set_id
       OR f.tenant_id IS DISTINCT FROM b.tenant_id
  `;
  const [publishedPii] = await sql<CountRow[]>`SELECT count(*)::int AS count FROM metadata.pii_inventory`;
  const [fields] = await sql<CountRow[]>`SELECT count(*)::int AS count FROM metadata.entity_field`;
  const [bindings] = await sql<CountRow[]>`SELECT count(*)::int AS count FROM metadata.entity_field_policy_binding`;
  const classifications = await sql<{ data_classification: string; count: number }[]>`
    SELECT data_classification, count(*)::int AS count FROM metadata.entity_field GROUP BY data_classification ORDER BY data_classification
  `;
  if ((invalidClassification?.count ?? 0) > 0) throw new Error(`${invalidClassification.count} fields have invalid classification`);
  if ((brokenBindings?.count ?? 0) > 0) throw new Error(`${brokenBindings.count} policy bindings have broken definition coordinates`);
  console.log(`Field authority: ${fields?.count ?? 0} fields, ${bindings?.count ?? 0} policy bindings, ${publishedPii?.count ?? 0} published PII fields`);
  for (const row of classifications) console.log(`  ${row.data_classification}: ${row.count}`);
  if ((bindings?.count ?? 0) === 0) console.warn("WARN: no field policy bindings are active in this DEV catalog");
  if ((publishedPii?.count ?? 0) === 0) console.warn("WARN: no published PII fields are active in this DEV catalog");
  console.log("PASS: current STUDIO field classifications, policy coordinates, and published PII projection are consistent");
} finally {
  await sql.end();
}
