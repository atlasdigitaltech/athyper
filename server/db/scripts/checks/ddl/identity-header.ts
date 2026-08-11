#!/usr/bin/env tsx
/**
 * Verify document-like entities have a runtime identity header contract.
 *
 * This check protects against a silent regression where entities render as
 * document-style headers but still rely on hardcoded identity pick-lists in UI
 * code.
 *
 * Behavior:
 *   - WARN-only by default when header identity is missing but column candidates exist.
 *   - FAIL when IDENTITY_HEADER_STRICT is true (or "1").
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --dir server/db run db:verify:identity-header
 *   IDENTITY_HEADER_STRICT=true pnpm --dir server/db run db:verify:identity-header
 */
import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

interface MissingIdentityHeaderRow {
  name: string;
  entity_code: string;
  table_schema: string;
  table_name: string;
  has_primary_candidate: boolean;
  has_secondary_candidate: boolean;
  has_classification_candidate: boolean;
  has_status_candidate: boolean;
}

interface InvalidIdentityHeaderFieldRow {
  name: string;
  entity_code: string;
  table_schema: string;
  table_name: string;
  slot_name: string;
  field_name: string;
}

type InvalidHeaderPresentationFieldRow = InvalidIdentityHeaderFieldRow;

const STRICT_MODE = ["1", "true", "TRUE", "yes", "YES"].includes(
  process.env["IDENTITY_HEADER_STRICT"] ?? "",
);

async function loadMissingRows(sql: ReturnType<typeof postgres>): Promise<MissingIdentityHeaderRow[]> {
  return sql<MissingIdentityHeaderRow[]>`
    WITH candidate_entities AS (
      SELECT
        e.name,
        e.entity_code,
        e.table_schema,
        e.table_name,
        COALESCE(e.identity_config, '{}'::jsonb) AS identity_config,
        COALESCE(e.display_config, '{}'::jsonb) AS display_config,
        e.entity_class
      FROM control.entity e
      WHERE e.tenant_id IS NULL
        AND (
          e.entity_class IN ('DOCUMENT', 'DOCUMENT_RELATION')
          OR e.display_config ->> 'detail_renderer' = 'document'
          OR e.display_config ->> 'list_renderer' = 'document'
        )
    ),
    candidates AS (
      SELECT
        ce.*,
        EXISTS (
          SELECT 1
          FROM information_schema.columns c
          WHERE c.table_schema = ce.table_schema
            AND c.table_name = ce.table_name
            AND c.column_name IN ('code', 'document_no', 'number', 'external_code')
        ) AS has_primary_candidate,
        EXISTS (
          SELECT 1
          FROM information_schema.columns c
          WHERE c.table_schema = ce.table_schema
            AND c.table_name = ce.table_name
            AND c.column_name IN ('name', 'display_name', 'title')
        ) AS has_secondary_candidate,
        EXISTS (
          SELECT 1
          FROM information_schema.columns c
          WHERE c.table_schema = ce.table_schema
            AND c.table_name = ce.table_name
            AND c.column_name IN ('invoice_type', 'document_type', 'type', 'category_label', 'classification')
        ) AS has_classification_candidate,
        EXISTS (
          SELECT 1
          FROM information_schema.columns c
          WHERE c.table_schema = ce.table_schema
            AND c.table_name = ce.table_name
            AND c.column_name IN ('status', 'lifecycle_state', 'state')
        ) AS has_status_candidate
      FROM candidate_entities ce
    )
    SELECT
      c.name,
      c.entity_code,
      c.table_schema,
      c.table_name,
      c.has_primary_candidate,
      c.has_secondary_candidate,
      c.has_classification_candidate,
      c.has_status_candidate
    FROM candidates c
    WHERE (
      c.identity_config -> 'header' IS NULL
      OR c.identity_config -> 'header' = '{}'::jsonb
    )
      AND (
        c.has_primary_candidate
        OR c.has_secondary_candidate
        OR c.has_classification_candidate
        OR c.has_status_candidate
      )
    ORDER BY c.table_schema, c.table_name;
  `;
}

async function loadInvalidFieldRows(sql: ReturnType<typeof postgres>): Promise<InvalidIdentityHeaderFieldRow[]> {
  return sql<InvalidIdentityHeaderFieldRow[]>`
    WITH entity_headers AS (
      SELECT
        e.id AS entity_id,
        e.name,
        e.entity_code,
        e.table_schema,
        e.table_name,
        ev.id AS entity_version_id,
        CASE
          WHEN jsonb_typeof(COALESCE(e.identity_config, '{}'::jsonb) -> 'header') = 'object'
            THEN COALESCE(e.identity_config, '{}'::jsonb) -> 'header'
          ELSE '{}'::jsonb
        END AS header_config
      FROM control.entity e
      JOIN control.entity_version ev
        ON ev.entity_id = e.id
       AND ev.tenant_id IS NULL
       AND ev.status = 'EFFECTIVE'
      WHERE e.tenant_id IS NULL
    ),
    configured_slots AS (
      SELECT
        eh.name,
        eh.entity_code,
        eh.table_schema,
        eh.table_name,
        eh.entity_version_id,
        slot.key::text AS slot_name,
        NULLIF(slot.value ->> 'field', '') AS field_name
      FROM entity_headers eh
      CROSS JOIN LATERAL jsonb_each(eh.header_config) AS slot(key, value)
      WHERE slot.key IN ('primary', 'secondary', 'classification', 'status')
    )
    SELECT
      cs.name,
      cs.entity_code,
      cs.table_schema,
      cs.table_name,
      cs.slot_name,
      cs.field_name
    FROM configured_slots cs
    WHERE cs.field_name IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM control.entity_field ef
        WHERE ef.entity_version_id = cs.entity_version_id
          AND ef.name = cs.field_name
          AND COALESCE(ef.is_active, true)
      )
    ORDER BY cs.table_schema, cs.table_name, cs.slot_name;
  `;
}

async function loadInvalidHeaderPresentationFieldRows(
  sql: ReturnType<typeof postgres>,
): Promise<InvalidHeaderPresentationFieldRow[]> {
  return sql<InvalidHeaderPresentationFieldRow[]>`
    WITH entity_headers AS (
      SELECT
        e.id AS entity_id,
        e.name,
        e.entity_code,
        e.table_schema,
        e.table_name,
        ev.id AS entity_version_id,
        CASE
          WHEN jsonb_typeof(COALESCE(e.display_config, '{}'::jsonb) -> 'header') = 'object'
            THEN COALESCE(e.display_config, '{}'::jsonb) -> 'header'
          ELSE '{}'::jsonb
        END AS header_config
      FROM control.entity e
      JOIN control.entity_version ev
        ON ev.entity_id = e.id
       AND ev.tenant_id IS NULL
       AND ev.status = 'EFFECTIVE'
      WHERE e.tenant_id IS NULL
    ),
    direct_refs AS (
      SELECT
        eh.name,
        eh.entity_code,
        eh.table_schema,
        eh.table_name,
        eh.entity_version_id,
        ref.slot_name,
        NULLIF(ref.field_name, '') AS field_name
      FROM entity_headers eh
      CROSS JOIN LATERAL (VALUES
        ('amount.headline.field', eh.header_config #>> '{amount,headline,field}'),
        ('amount.headline.currency_field', eh.header_config #>> '{amount,headline,currency_field}'),
        ('amount.headline.base_amount.field', eh.header_config #>> '{amount,headline,base_amount,field}'),
        ('amount.headline.base_amount.currency_field', eh.header_config #>> '{amount,headline,base_amount,currency_field}'),
        ('amount.headline.base_amount.exchange_rate_field', eh.header_config #>> '{amount,headline,base_amount,exchange_rate_field}'),
        ('amount.secondary.field', eh.header_config #>> '{amount,secondary,field}'),
        ('amount.secondary.currency_field', eh.header_config #>> '{amount,secondary,currency_field}')
      ) AS ref(slot_name, field_name)
    ),
    fact_refs AS (
      SELECT
        eh.name,
        eh.entity_code,
        eh.table_schema,
        eh.table_name,
        eh.entity_version_id,
        'facts[' || fact.ord::text || '].field' AS slot_name,
        NULLIF(fact.value ->> 'field', '') AS field_name
      FROM entity_headers eh
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(eh.header_config -> 'facts') = 'array'
            THEN eh.header_config -> 'facts'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS fact(value, ord)
    ),
    subtitle_refs AS (
      SELECT
        eh.name,
        eh.entity_code,
        eh.table_schema,
        eh.table_name,
        eh.entity_version_id,
        'subtitle_rows[' || row.ord::text || '].fields[' || field.ord::text || ']' AS slot_name,
        NULLIF(field.value #>> '{}', '') AS field_name
      FROM entity_headers eh
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(eh.header_config -> 'subtitle_rows') = 'array'
            THEN eh.header_config -> 'subtitle_rows'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS row(value, ord)
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(row.value -> 'fields') = 'array'
            THEN row.value -> 'fields'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS field(value, ord)
      WHERE jsonb_typeof(field.value) = 'string'
    ),
    status_badge_refs AS (
      SELECT
        eh.name,
        eh.entity_code,
        eh.table_schema,
        eh.table_name,
        eh.entity_version_id,
        'status_badges[' || badge.ord::text || '].' || ref.key AS slot_name,
        NULLIF(ref.field_name, '') AS field_name
      FROM entity_headers eh
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(eh.header_config -> 'status_badges') = 'array'
            THEN eh.header_config -> 'status_badges'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS badge(value, ord)
      CROSS JOIN LATERAL (VALUES
        ('field', badge.value ->> 'field'),
        ('type_field', badge.value ->> 'type_field'),
        ('status_field', badge.value ->> 'status_field')
      ) AS ref(key, field_name)
    ),
    visibility_refs AS (
      SELECT
        eh.name,
        eh.entity_code,
        eh.table_schema,
        eh.table_name,
        eh.entity_version_id,
        'tabs.visibility_rules.' || rule.key || '.' || ref.key AS slot_name,
        NULLIF(ref.field_name, '') AS field_name
      FROM entity_headers eh
      CROSS JOIN LATERAL jsonb_each(
        CASE
          WHEN jsonb_typeof(eh.header_config #> '{tabs,visibility_rules}') = 'object'
            THEN eh.header_config #> '{tabs,visibility_rules}'
          ELSE '{}'::jsonb
        END
      ) AS rule(key, value)
      CROSS JOIN LATERAL (VALUES
        ('field', rule.value ->> 'field'),
        ('field_equals', rule.value #>> '{field_equals,0}')
      ) AS ref(key, field_name)
    ),
    configured_refs AS (
      SELECT * FROM direct_refs
      UNION ALL SELECT * FROM fact_refs
      UNION ALL SELECT * FROM subtitle_refs
      UNION ALL SELECT * FROM status_badge_refs
      UNION ALL SELECT * FROM visibility_refs
    )
    SELECT
      cr.name,
      cr.entity_code,
      cr.table_schema,
      cr.table_name,
      cr.slot_name,
      cr.field_name
    FROM configured_refs cr
    WHERE cr.field_name IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM control.entity_field ef
        WHERE ef.entity_version_id = cr.entity_version_id
          AND ef.name = cr.field_name
          AND COALESCE(ef.is_active, true)
      )
    ORDER BY cr.table_schema, cr.table_name, cr.slot_name;
  `;
}

function formatCandidates(row: MissingIdentityHeaderRow): string {
  const chunks = [];
  if (row.has_primary_candidate) chunks.push("primary");
  if (row.has_secondary_candidate) chunks.push("secondary");
  if (row.has_classification_candidate) chunks.push("classification");
  if (row.has_status_candidate) chunks.push("status");
  return chunks.join(", ");
}

function report(
  missingRows: MissingIdentityHeaderRow[],
  invalidFieldRows: InvalidIdentityHeaderFieldRow[],
  invalidHeaderPresentationFieldRows: InvalidHeaderPresentationFieldRow[],
): boolean {
  const heading = "Phase 2 — verify-identity-header";
  console.log(`\n\x1b[1m${heading}\x1b[0m`);
  console.log("─".repeat(heading.length + 2));

  let passed = true;
  const rows = missingRows;

  if (invalidFieldRows.length === 0) {
    console.log("\x1b[32mPASS - every identity.header field resolves to control.entity_field.\x1b[0m");
  } else {
    console.log(`\n\x1b[31mFAIL - ${invalidFieldRows.length} identity.header field reference(s) do not resolve\x1b[0m`);
    for (const row of invalidFieldRows.slice(0, 25)) {
      const label = row.name || row.entity_code;
      console.log(`  - ${label} (${row.table_schema}.${row.table_name}) ${row.slot_name}.field = ${row.field_name}`);
    }
    if (invalidFieldRows.length > 25) {
      console.log(`  ...and ${invalidFieldRows.length - 25} more`);
    }
    passed = false;
  }

  if (invalidHeaderPresentationFieldRows.length === 0) {
    console.log("\x1b[32mPASS - every display.header field resolves to control.entity_field.\x1b[0m");
  } else {
    console.log(`\n\x1b[31mFAIL - ${invalidHeaderPresentationFieldRows.length} display.header field reference(s) do not resolve\x1b[0m`);
    for (const row of invalidHeaderPresentationFieldRows.slice(0, 25)) {
      const label = row.name || row.entity_code;
      console.log(`  - ${label} (${row.table_schema}.${row.table_name}) ${row.slot_name} = ${row.field_name}`);
    }
    if (invalidHeaderPresentationFieldRows.length > 25) {
      console.log(`  ...and ${invalidHeaderPresentationFieldRows.length - 25} more`);
    }
    passed = false;
  }

  if (missingRows.length === 0) {
    console.log("\x1b[32mPASS — all document-like entities define identity.header.\x1b[0m\n");
    return passed;
  }

  console.log(`\n\x1b[33mWARN — ${rows.length} document-like entity(ies) currently have no identity.header\x1b[0m`);
  for (const row of missingRows.slice(0, 25)) {
    const label = row.name || row.entity_code;
    const candidates = formatCandidates(row);
    console.log(`  - ${label} (${row.table_schema}.${row.table_name}) [candidate fields: ${candidates}]`);
  }
  if (missingRows.length > 25) {
    console.log(`  ...and ${missingRows.length - 25} more`);
  }
  console.log("\nRun the phase-2 identity backfill script pass to seed header slots.\n");

  if (STRICT_MODE) {
    console.log("\x1b[31mFAIL — strict mode is enabled.\x1b[0m\n");
    return false;
  }
  console.log("\x1b[33mPASS-WITH-WARN — strict mode is disabled.\x1b[0m\n");
  return passed;
}

async function main(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { onnotice: () => undefined });
  try {
    const missingRows = await loadMissingRows(sql);
    const invalidFieldRows = await loadInvalidFieldRows(sql);
    const invalidHeaderPresentationFieldRows = await loadInvalidHeaderPresentationFieldRows(sql);
    const passed = report(missingRows, invalidFieldRows, invalidHeaderPresentationFieldRows);
    process.exit(passed ? 0 : 1);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\x1b[31mverify-identity-header crashed:\x1b[0m", err);
  process.exit(2);
});
