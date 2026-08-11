#!/usr/bin/env tsx
/**
 * Read-only Wave 0 authorization and cross-tenant data-quality report.
 *
 * The report emits one deterministic SHA-256 fingerprint per finding and
 * joins control.authorization_anomaly_disposition by that fingerprint.
 * --strict exits non-zero while any finding lacks an approved disposition.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";

interface Options {
  output?: string;
  strict: boolean;
}

interface RawFinding {
  source_primary_key: unknown;
  observed_tenant_id: string | null;
  referenced_tenant_id: string | null;
  details: unknown;
}

interface Finding {
  fingerprint: string;
  kind: string;
  severity: "warning" | "high" | "critical";
  sourceSchema: string;
  sourceTable: string;
  sourcePrimaryKey: unknown;
  observedTenantId: string | null;
  referencedTenantId: string | null;
  details: unknown;
}

interface ForeignKeyRow {
  constraint_name: string;
  child_schema: string;
  child_table: string;
  parent_schema: string;
  parent_table: string;
  child_columns: string[];
  parent_columns: string[];
  child_pk_columns: string[];
}

interface DispositionRow {
  finding_fingerprint: string;
  classification: string;
  severity: string;
  owner_team: string;
  reason: string;
  remediation: string | null;
  approval_ticket: string;
  approved_by: string;
  approved_at: Date;
  resolved_at: Date | null;
}

function parseOptions(args: string[]): Options {
  const options: Options = { strict: false };
  for (const arg of args) {
    if (arg === "--strict") {
      options.strict = true;
    } else if (arg.startsWith("--output=")) {
      const value = arg.slice("--output=".length).trim();
      if (!value) throw new Error("--output requires a path");
      options.output = resolve(value);
    } else if (arg === "--help") {
      process.stdout.write(
        "Usage: neon-authorization-quality.ts [--strict] [--output=PATH]\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function fingerprintFor(
  kind: string,
  sourceSchema: string,
  sourceTable: string,
  row: RawFinding,
): string {
  const material = canonicalize({
    kind,
    sourceSchema,
    sourceTable,
    sourcePrimaryKey: row.source_primary_key,
    observedTenantId: row.observed_tenant_id,
    referencedTenantId: row.referenced_tenant_id,
    details: row.details,
  });
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

const options = parseOptions(process.argv.slice(2));
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for the Wave 0 data-quality report.");
}

const client = new pg.Client({
  connectionString,
  application_name: "wave0-authorization-data-quality-report",
});
const findings: Finding[] = [];
const skippedChecks: Array<{ check: string; reason: string }> = [];

async function relationExists(schema: string, table: string): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS present",
    [`${schema}.${table}`],
  );
  return result.rows[0]?.present === true;
}

function addFindings(
  kind: string,
  severity: Finding["severity"],
  sourceSchema: string,
  sourceTable: string,
  rows: RawFinding[],
): void {
  for (const row of rows) {
    findings.push({
      fingerprint: fingerprintFor(kind, sourceSchema, sourceTable, row),
      kind,
      severity,
      sourceSchema,
      sourceTable,
      sourcePrimaryKey: row.source_primary_key,
      observedTenantId: row.observed_tenant_id,
      referencedTenantId: row.referenced_tenant_id,
      details: row.details,
    });
  }
}

async function runTenantReferenceCheck(input: {
  kind: string;
  severity: Finding["severity"];
  sourceSchema: string;
  sourceTable: string;
  sourceIdColumn?: string;
  sourceReferenceColumn: string;
  targetSchema: string;
  targetTable: string;
  targetIdColumn?: string;
  targetTenantColumn?: string;
  predicate?: string;
  referenceType: string;
}): Promise<void> {
  const {
    kind,
    severity,
    sourceSchema,
    sourceTable,
    sourceIdColumn = "id",
    sourceReferenceColumn,
    targetSchema,
    targetTable,
    targetIdColumn = "id",
    targetTenantColumn = "tenant_id",
    predicate = "true",
    referenceType,
  } = input;

  if (
    !(await relationExists(sourceSchema, sourceTable))
    || !(await relationExists(targetSchema, targetTable))
  ) {
    skippedChecks.push({
      check: kind,
      reason: `missing ${sourceSchema}.${sourceTable} or ${targetSchema}.${targetTable}`,
    });
    return;
  }

  const source = `${quoteIdent(sourceSchema)}.${quoteIdent(sourceTable)}`;
  const target = `${quoteIdent(targetSchema)}.${quoteIdent(targetTable)}`;
  const result = await client.query<RawFinding>(`
    SELECT
      jsonb_build_object(
        ${quoteLiteral(sourceIdColumn)},
        source_row.${quoteIdent(sourceIdColumn)}
      ) AS source_primary_key,
      source_row.tenant_id::text AS observed_tenant_id,
      target_row.${quoteIdent(targetTenantColumn)}::text AS referenced_tenant_id,
      jsonb_build_object(
        'referenceType', ${quoteLiteral(referenceType)},
        'referenceColumn', ${quoteLiteral(sourceReferenceColumn)},
        'target', ${quoteLiteral(`${targetSchema}.${targetTable}`)},
        'orphan', target_row.${quoteIdent(targetIdColumn)} IS NULL
      ) AS details
    FROM ${source} AS source_row
    LEFT JOIN ${target} AS target_row
      ON target_row.${quoteIdent(targetIdColumn)}
       = source_row.${quoteIdent(sourceReferenceColumn)}
    WHERE source_row.${quoteIdent(sourceReferenceColumn)} IS NOT NULL
      AND (${predicate})
      AND (
        target_row.${quoteIdent(targetIdColumn)} IS NULL
        OR source_row.tenant_id
           IS DISTINCT FROM target_row.${quoteIdent(targetTenantColumn)}
      )
    ORDER BY source_row.${quoteIdent(sourceIdColumn)}
  `);
  addFindings(kind, severity, sourceSchema, sourceTable, result.rows);
}

try {
  await client.connect();
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout = '5min'");

  if (!(await relationExists("control", "authorization_anomaly_disposition"))) {
    throw new Error(
      "control.authorization_anomaly_disposition is missing; install Wave 0 DDL first.",
    );
  }
  if (!(await relationExists("event", "authorization_capture_clock"))) {
    throw new Error(
      "event.authorization_capture_clock is missing; install Wave 0 capture before evidence collection.",
    );
  }
  const captureBoundary = (await client.query<{
    database_name: string;
    database_oid: string;
    source_database_id: string;
    capture_contract_version: string;
    current_watermark: string;
    captured_at: string;
  }>(`
    SELECT
      current_database() AS database_name,
      (SELECT oid::text FROM pg_database WHERE datname = current_database())
        AS database_oid,
      clock.source_database_id::text,
      clock.capture_contract_version,
      clock.current_watermark::text,
      statement_timestamp()::text AS captured_at
    FROM event.authorization_capture_clock AS clock
    WHERE clock.singleton_id = 1
  `)).rows[0];
  if (!captureBoundary) {
    throw new Error("Authorization capture clock singleton is missing.");
  }

  // Discover every FK where both sides carry tenant_id but the FK itself does
  // not constrain tenant_id. Then enumerate every current cross-tenant row.
  const unsafeForeignKeys = await client.query<ForeignKeyRow>(`
    WITH foreign_keys AS (
      SELECT
        constraint_record.oid,
        constraint_record.conname AS constraint_name,
        child_namespace.nspname AS child_schema,
        child_table.relname AS child_table,
        child_table.oid AS child_oid,
        parent_namespace.nspname AS parent_schema,
        parent_table.relname AS parent_table,
        array_agg(child_column.attname ORDER BY key_pair.ordinality) AS child_columns,
        array_agg(parent_column.attname ORDER BY key_pair.ordinality) AS parent_columns,
        bool_or(
          child_column.attname = 'tenant_id'
          AND parent_column.attname = 'tenant_id'
        ) AS constrains_tenant
      FROM pg_constraint AS constraint_record
      JOIN pg_class AS child_table
        ON child_table.oid = constraint_record.conrelid
      JOIN pg_namespace AS child_namespace
        ON child_namespace.oid = child_table.relnamespace
      JOIN pg_class AS parent_table
        ON parent_table.oid = constraint_record.confrelid
      JOIN pg_namespace AS parent_namespace
        ON parent_namespace.oid = parent_table.relnamespace
      CROSS JOIN LATERAL unnest(
        constraint_record.conkey,
        constraint_record.confkey
      ) WITH ORDINALITY AS key_pair(
        child_attribute_number,
        parent_attribute_number,
        ordinality
      )
      JOIN pg_attribute AS child_column
        ON child_column.attrelid = child_table.oid
       AND child_column.attnum = key_pair.child_attribute_number
      JOIN pg_attribute AS parent_column
        ON parent_column.attrelid = parent_table.oid
       AND parent_column.attnum = key_pair.parent_attribute_number
      WHERE constraint_record.contype = 'f'
        AND child_namespace.nspname NOT IN (
          'pg_catalog', 'information_schema', 'pg_toast'
        )
        AND EXISTS (
          SELECT 1
          FROM pg_attribute AS tenant_column
          WHERE tenant_column.attrelid = child_table.oid
            AND tenant_column.attname = 'tenant_id'
            AND tenant_column.attnum > 0
            AND NOT tenant_column.attisdropped
        )
        AND EXISTS (
          SELECT 1
          FROM pg_attribute AS tenant_column
          WHERE tenant_column.attrelid = parent_table.oid
            AND tenant_column.attname = 'tenant_id'
            AND tenant_column.attnum > 0
            AND NOT tenant_column.attisdropped
        )
      GROUP BY
        constraint_record.oid,
        constraint_record.conname,
        child_namespace.nspname,
        child_table.relname,
        child_table.oid,
        parent_namespace.nspname,
        parent_table.relname
    )
    SELECT
      foreign_key.constraint_name,
      foreign_key.child_schema,
      foreign_key.child_table,
      foreign_key.parent_schema,
      foreign_key.parent_table,
      foreign_key.child_columns,
      foreign_key.parent_columns,
      COALESCE(primary_key.columns, foreign_key.child_columns)
        AS child_pk_columns
    FROM foreign_keys AS foreign_key
    LEFT JOIN LATERAL (
      SELECT array_agg(column_record.attname ORDER BY key_column.ordinality)
        AS columns
      FROM pg_index AS index_record
      CROSS JOIN LATERAL unnest(index_record.indkey)
        WITH ORDINALITY AS key_column(attribute_number, ordinality)
      JOIN pg_attribute AS column_record
        ON column_record.attrelid = index_record.indrelid
       AND column_record.attnum = key_column.attribute_number
      WHERE index_record.indrelid = foreign_key.child_oid
        AND index_record.indisprimary
    ) AS primary_key ON true
    WHERE NOT foreign_key.constrains_tenant
    ORDER BY
      foreign_key.child_schema,
      foreign_key.child_table,
      foreign_key.constraint_name
  `);

  for (const foreignKey of unsafeForeignKeys.rows) {
    const child = `${quoteIdent(foreignKey.child_schema)}.${quoteIdent(foreignKey.child_table)}`;
    const parent = `${quoteIdent(foreignKey.parent_schema)}.${quoteIdent(foreignKey.parent_table)}`;
    const join = foreignKey.child_columns
      .map((column, index) => {
        const parentColumn = foreignKey.parent_columns[index];
        if (!parentColumn) {
          throw new Error(`Malformed FK metadata for ${foreignKey.constraint_name}`);
        }
        return `child.${quoteIdent(column)} = parent.${quoteIdent(parentColumn)}`;
      })
      .join(" AND ");
    const keyArgs = foreignKey.child_pk_columns
      .flatMap((column) => [quoteLiteral(column), `child.${quoteIdent(column)}`])
      .join(", ");
    const rows = await client.query<RawFinding>(`
      SELECT
        jsonb_build_object(${keyArgs}) AS source_primary_key,
        child.tenant_id::text AS observed_tenant_id,
        parent.tenant_id::text AS referenced_tenant_id,
        jsonb_build_object(
          'constraint', ${quoteLiteral(foreignKey.constraint_name)},
          'parentTable', ${quoteLiteral(`${foreignKey.parent_schema}.${foreignKey.parent_table}`)},
          'childColumns', ${quoteLiteral(foreignKey.child_columns.join(","))},
          'parentColumns', ${quoteLiteral(foreignKey.parent_columns.join(","))}
        ) AS details
      FROM ${child} AS child
      JOIN ${parent} AS parent ON ${join}
      WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
      ORDER BY jsonb_build_object(${keyArgs})::text
    `);
    addFindings(
      "cross_tenant_fk",
      "critical",
      foreignKey.child_schema,
      foreignKey.child_table,
      rows.rows,
    );
  }

  // Every active human principal is emitted in the identity inventory below;
  // missing exact IdP bindings and group assignment are separate gate findings.
  const identityInventory = await client.query<{
    principal_id: string;
    tenant_id: string;
    principal_type: string;
    principal_source: string | null;
    identity_binding_count: string;
    group_membership_count: string;
  }>(`
    SELECT
      principal.id AS principal_id,
      principal.tenant_id,
      principal.principal_type,
      principal.principal_source,
      (
        SELECT count(*)::bigint
        FROM master.principal_identity_binding AS binding
        WHERE binding.tenant_id = principal.tenant_id
          AND binding.principal_id = principal.id
      ) AS identity_binding_count,
      (
        SELECT count(*)::bigint
        FROM master.auth_group_member AS membership
        WHERE membership.tenant_id = principal.tenant_id
          AND membership.principal_id = principal.id
      ) AS group_membership_count
    FROM master.principal AS principal
    WHERE principal.status = 'active'
      AND NOT principal.is_service_account
    ORDER BY principal.tenant_id, principal.id
  `);

  const missingBindingRows: RawFinding[] = identityInventory.rows
    .filter((row) => row.identity_binding_count === "0")
    .map((row) => ({
      source_primary_key: { id: row.principal_id },
      observed_tenant_id: row.tenant_id,
      referenced_tenant_id: null,
      details: {
        principalType: row.principal_type,
        principalSource: row.principal_source,
        missing: "principal_identity_binding",
      },
    }));
  addFindings(
    "active_principal_missing_identity_binding",
    "critical",
    "master",
    "principal",
    missingBindingRows,
  );

  const missingGroupRows: RawFinding[] = identityInventory.rows
    .filter((row) => row.group_membership_count === "0")
    .map((row) => ({
      source_primary_key: { id: row.principal_id },
      observed_tenant_id: row.tenant_id,
      referenced_tenant_id: null,
      details: {
        principalType: row.principal_type,
        principalSource: row.principal_source,
        missing: "auth_group_member",
      },
    }));
  addFindings(
    "active_principal_missing_group_assignment",
    "high",
    "master",
    "principal",
    missingGroupRows,
  );

  await runTenantReferenceCheck({
    kind: "access_grant_principal_tenant",
    severity: "critical",
    sourceSchema: "master",
    sourceTable: "access_grant",
    sourceReferenceColumn: "principal_id",
    targetSchema: "master",
    targetTable: "principal",
    predicate: "source_row.principal_id IS NOT NULL",
    referenceType: "principal",
  });
  await runTenantReferenceCheck({
    kind: "access_grant_group_tenant",
    severity: "critical",
    sourceSchema: "master",
    sourceTable: "access_grant",
    sourceReferenceColumn: "group_id",
    targetSchema: "master",
    targetTable: "auth_group",
    predicate: "source_row.group_id IS NOT NULL",
    referenceType: "group",
  });
  await runTenantReferenceCheck({
    kind: "content_acl_principal_tenant",
    severity: "critical",
    sourceSchema: "master",
    sourceTable: "content_item_access_grant",
    sourceReferenceColumn: "subject_id",
    targetSchema: "master",
    targetTable: "principal",
    predicate: "source_row.subject_type = 'principal'",
    referenceType: "principal",
  });
  await runTenantReferenceCheck({
    kind: "content_acl_group_tenant",
    severity: "critical",
    sourceSchema: "master",
    sourceTable: "content_item_access_grant",
    sourceReferenceColumn: "subject_id",
    targetSchema: "master",
    targetTable: "auth_group",
    predicate: "source_row.subject_type = 'group'",
    referenceType: "group",
  });

  const scopeMappings = [
    {
      scopeType: "company_code",
      targetTable: "company_code",
      targetTenantColumn: "tenant_id",
    },
    {
      scopeType: "legal_entity",
      targetTable: "legal_entity",
      targetTenantColumn: "tenant_id",
    },
    {
      scopeType: "operating_organization",
      targetTable: "operating_organization",
      targetTenantColumn: "tenant_id",
    },
    {
      scopeType: "network_membership",
      targetTable: "business_network_membership",
      targetTenantColumn: "participant_tenant_id",
    },
  ] as const;
  for (const sourceTable of ["auth_group_role", "access_grant"] as const) {
    for (const mapping of scopeMappings) {
      await runTenantReferenceCheck({
        kind: "assignment_scope_reference_tenant",
        severity: "critical",
        sourceSchema: "master",
        sourceTable,
        sourceReferenceColumn: "assignment_scope_ref_id",
        targetSchema: "master",
        targetTable: mapping.targetTable,
        targetTenantColumn: mapping.targetTenantColumn,
        predicate: `source_row.assignment_scope_type = ${quoteLiteral(mapping.scopeType)}`,
        referenceType: mapping.scopeType,
      });
    }
  }

  const companyCodeSubjectMappings = [
    { entityType: "principal", targetTable: "principal" },
    { entityType: "auth_group", targetTable: "auth_group" },
    { entityType: "auth_group_role", targetTable: "auth_group_role" },
    { entityType: "team", targetTable: "team" },
  ] as const;
  for (const mapping of companyCodeSubjectMappings) {
    await runTenantReferenceCheck({
      kind: "company_code_access_subject_tenant",
      severity: "critical",
      sourceSchema: "master",
      sourceTable: "company_code_access",
      sourceReferenceColumn: "entity_id",
      targetSchema: "master",
      targetTable: mapping.targetTable,
      predicate: `source_row.entity_type = ${quoteLiteral(mapping.entityType)}`,
      referenceType: mapping.entityType,
    });
  }

  const supportedCompanyCodeTypes = companyCodeSubjectMappings.map(
    (mapping) => mapping.entityType,
  );
  const unknownCompanyCodeTypes = await client.query<RawFinding>(`
    SELECT
      jsonb_build_object('id', access.id) AS source_primary_key,
      access.tenant_id::text AS observed_tenant_id,
      NULL::text AS referenced_tenant_id,
      jsonb_build_object(
        'entityType', access.entity_type,
        'entityId', access.entity_id,
        'reason', 'no approved authorization-subject target mapping'
      ) AS details
    FROM master.company_code_access AS access
    WHERE access.entity_type <> ALL ($1::text[])
    ORDER BY access.id
  `, [supportedCompanyCodeTypes]);
  addFindings(
    "company_code_access_unmapped_subject_type",
    "high",
    "master",
    "company_code_access",
    unknownCompanyCodeTypes.rows,
  );

  const missingEntityPermissions = await client.query<RawFinding>(`
    SELECT
      jsonb_build_object('id', operation.id) AS source_primary_key,
      operation.tenant_id::text AS observed_tenant_id,
      NULL::text AS referenced_tenant_id,
      jsonb_build_object(
        'entityName', operation.entity_name,
        'permissionCode', operation.permission_code
      ) AS details
    FROM control.entity_operation AS operation
    LEFT JOIN shared.permission AS permission
      ON permission.code = operation.permission_code
    WHERE permission.id IS NULL
    ORDER BY operation.id
  `);
  addFindings(
    "entity_operation_missing_permission",
    "critical",
    "control",
    "entity_operation",
    missingEntityPermissions.rows,
  );

  const missingDelegationPermissions = await client.query<RawFinding>(`
    SELECT
      jsonb_build_object(
        'id', delegation.id,
        'permission_code', delegated_permission.permission_code
      ) AS source_primary_key,
      delegation.tenant_id::text AS observed_tenant_id,
      NULL::text AS referenced_tenant_id,
      jsonb_build_object(
        'permissionCode', delegated_permission.permission_code
      ) AS details
    FROM master.delegation_grant AS delegation
    CROSS JOIN LATERAL unnest(delegation.permissions)
      AS delegated_permission(permission_code)
    LEFT JOIN shared.permission AS permission
      ON permission.code = delegated_permission.permission_code
    WHERE permission.id IS NULL
    ORDER BY delegation.id, delegated_permission.permission_code
  `);
  addFindings(
    "delegation_missing_permission",
    "critical",
    "master",
    "delegation_grant",
    missingDelegationPermissions.rows,
  );

  const implicitAllDelegations = await client.query<RawFinding>(`
    SELECT
      jsonb_build_object('id', delegation.id) AS source_primary_key,
      delegation.tenant_id::text AS observed_tenant_id,
      NULL::text AS referenced_tenant_id,
      jsonb_build_object(
        'reason', 'empty permission array means all delegator permissions'
      ) AS details
    FROM master.delegation_grant AS delegation
    WHERE cardinality(delegation.permissions) = 0
      AND NOT delegation.is_revoked
      AND delegation.expires_at > now()
    ORDER BY delegation.id
  `);
  addFindings(
    "active_delegation_implicit_all_permissions",
    "high",
    "master",
    "delegation_grant",
    implicitAllDelegations.rows,
  );

  findings.sort((left, right) => (
    left.kind.localeCompare(right.kind)
    || left.sourceSchema.localeCompare(right.sourceSchema)
    || left.sourceTable.localeCompare(right.sourceTable)
    || left.fingerprint.localeCompare(right.fingerprint)
  ));

  const dispositions = await client.query<DispositionRow>(`
    SELECT
      finding_fingerprint,
      classification,
      severity,
      owner_team,
      reason,
      remediation,
      approval_ticket,
      approved_by,
      approved_at,
      resolved_at
    FROM control.authorization_anomaly_disposition
    ORDER BY finding_fingerprint
  `);
  const dispositionByFingerprint = new Map(
    dispositions.rows.map((row) => [row.finding_fingerprint, row]),
  );
  const findingsWithDisposition = findings.map((finding) => ({
    ...finding,
    disposition: dispositionByFingerprint.get(finding.fingerprint) ?? null,
  }));
  const unclassified = findingsWithDisposition.filter(
    (finding) => finding.disposition === null,
  );
  const staleDispositions = dispositions.rows.filter(
    (disposition) => !findings.some(
      (finding) => finding.fingerprint === disposition.finding_fingerprint,
    ),
  );
  const blockingReasons = [
    ...(unclassified.length > 0 ? ["unclassified_findings"] : []),
    ...(skippedChecks.length > 0 ? ["skipped_quality_checks"] : []),
    ...(staleDispositions.length > 0 ? ["stale_dispositions"] : []),
  ];

  const report = {
    schemaVersion: "wave0.authorization-data-quality-report.v1",
    fingerprintVersion: "sha256-canonical-json-v1",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    plane: "neon",
    strict: options.strict,
    database: captureBoundary,
    gate: {
      passed: blockingReasons.length === 0,
      blockingReasons,
      unclassifiedFindingCount: unclassified.length,
      skippedCheckCount: skippedChecks.length,
      staleDispositionCount: staleDispositions.length,
    },
    summary: {
      activeHumanPrincipalCount: identityInventory.rows.length,
      unsafeForeignKeyDefinitionCount: unsafeForeignKeys.rows.length,
      findingCount: findings.length,
      classifiedFindingCount: findings.length - unclassified.length,
      unclassifiedFindingCount: unclassified.length,
      staleDispositionCount: staleDispositions.length,
      skippedCheckCount: skippedChecks.length,
    },
    identityInventory: identityInventory.rows,
    unsafeForeignKeys: unsafeForeignKeys.rows,
    skippedChecks,
    findings: findingsWithDisposition,
    staleDispositions,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, serialized, "utf8");
    process.stdout.write(`Wrote ${options.output}\n`);
  } else {
    process.stdout.write(serialized);
  }

  if (options.strict && blockingReasons.length > 0) {
    process.exitCode = 2;
  }
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end().catch(() => undefined);
}
