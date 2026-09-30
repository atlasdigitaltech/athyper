#!/usr/bin/env tsx
/**
 * Verify current active runtime descriptors expose exactly one visible identity
 * field. The legacy control.entity/entity_version model was retired; identity
 * presentation is now compiled into runtime_meta.entity_descriptor.
 */
import postgres from "postgres";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL is required");
  process.exit(1);
}

interface DescriptorRow {
  entity_code: string;
  descriptor_kind: string;
  identity_count: number;
  identity_keys: string[];
  invalid_identity_count: number;
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
try {
  const [identity] = await sql<{ database_name: string }[]>`SELECT current_database() AS database_name`;
  const descriptors = await sql<DescriptorRow[]>`
    SELECT descriptor.compiled_json->>'entityCode' AS entity_code,
           descriptor.descriptor_kind,
           count(*) FILTER (WHERE field.value #>> '{list,semanticRole}' = 'identity')::int AS identity_count,
           COALESCE(array_agg(field.value->>'key' ORDER BY field.ordinality)
             FILTER (WHERE field.value #>> '{list,semanticRole}' = 'identity'), ARRAY[]::text[]) AS identity_keys,
           count(*) FILTER (
             WHERE field.value #>> '{list,semanticRole}' = 'identity'
               AND (
                 NULLIF(field.value->>'key','') IS NULL
                 OR field.value #>> '{list,defaultVisible}' IS DISTINCT FROM 'true'
                 OR COALESCE((field.value->>'required')::boolean, false) = false
               )
           )::int AS invalid_identity_count
      FROM runtime_meta.entity_descriptor descriptor
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(descriptor.compiled_json->'fields') = 'array'
             THEN descriptor.compiled_json->'fields' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS field(value, ordinality)
     WHERE descriptor.status = 'active'
       AND descriptor.descriptor_kind IN ('entity_runtime','admin_preview')
     GROUP BY descriptor.id, descriptor.compiled_json->>'entityCode', descriptor.descriptor_kind
     ORDER BY descriptor.compiled_json->>'entityCode'
  `;

  if (descriptors.length === 0) {
    console.log(`SKIP ${identity?.database_name}: no active runtime entity descriptors`);
  } else {
    const failures = descriptors.filter((row) => !row.entity_code || row.identity_count !== 1 || row.invalid_identity_count !== 0);
    for (const row of descriptors) {
      const status = failures.includes(row) ? "FAIL" : "PASS";
      console.log(`${status} ${row.entity_code || '<missing-code>'}/${row.descriptor_kind}: identities=${row.identity_keys.join(',') || '<none>'}`);
    }
    if (failures.length > 0) throw new Error(`${failures.length} active descriptors fail the compiled identity-field contract`);
    console.log(`PASS ${identity?.database_name}: ${descriptors.length} active descriptors have one required, visible identity field`);
  }
} finally {
  await sql.end();
}
