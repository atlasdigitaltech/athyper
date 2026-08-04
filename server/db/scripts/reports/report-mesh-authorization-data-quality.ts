#!/usr/bin/env tsx
/**
 * Read-only Wave 0 Mesh identity, grant, and account-boundary report.
 *
 * Findings have deterministic SHA-256 fingerprints and reconcile only with
 * owner-approved mesh_control.authorization_anomaly_disposition rows. The
 * report intentionally accepts only MESH_DATABASE_URL.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";

interface Options {
  output?: string;
  strict: boolean;
}

type Severity = "warning" | "high" | "critical";

interface RawFinding {
  source_primary_key: unknown;
  observed_scope_kind: string | null;
  observed_scope_value: unknown | null;
  referenced_scope_kind: string | null;
  referenced_scope_value: unknown | null;
  details: unknown;
}

interface Finding {
  fingerprint: string;
  kind: string;
  severity: Severity;
  sourceSchema: "mesh";
  sourceTable: string;
  sourcePrimaryKey: unknown;
  observedScopeKind: string | null;
  observedScopeValue: unknown | null;
  referencedScopeKind: string | null;
  referencedScopeValue: unknown | null;
  details: unknown;
}

interface DispositionRow {
  finding_fingerprint: string;
  finding_kind: string;
  severity: string;
  source_schema: string;
  source_table: string;
  classification: string;
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
        "Usage: report-mesh-authorization-data-quality.ts "
          + "[--strict] [--output=PATH]\n",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
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
  severity: Severity,
  sourceTable: string,
  row: RawFinding,
): string {
  const material = canonicalize({
    kind,
    severity,
    sourceSchema: "mesh",
    sourceTable,
    sourcePrimaryKey: row.source_primary_key,
    observedScopeKind: row.observed_scope_kind,
    observedScopeValue: row.observed_scope_value,
    referencedScopeKind: row.referenced_scope_kind,
    referencedScopeValue: row.referenced_scope_value,
    details: row.details,
  });
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

const REQUIRED_RELATIONS = [
  "mesh.principal",
  "mesh.principal_identity_binding",
  "mesh.network_account",
  "mesh.account_grant",
  "mesh.network_relationship",
  "mesh.attachment_acl",
  "mesh.content_item_access_grant",
  "mesh.conversation",
  "mesh.conversation_participant",
  "mesh_control.authorization_anomaly_disposition",
  "mesh_log.authorization_capture_clock",
] as const;

const options = parseOptions(process.argv.slice(2));
const connectionString = process.env.MESH_DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error(
    "MESH_DATABASE_URL is required; the Mesh report never falls back to DATABASE_URL.",
  );
}

const client = new pg.Client({
  connectionString,
  application_name: "wave0-mesh-authorization-data-quality-report",
});
const findings: Finding[] = [];

async function addCheck(
  kind: string,
  severity: Severity,
  sourceTable: string,
  sql: string,
): Promise<void> {
  const result = await client.query<RawFinding>(sql);
  for (const row of result.rows) {
    findings.push({
      fingerprint: fingerprintFor(kind, severity, sourceTable, row),
      kind,
      severity,
      sourceSchema: "mesh",
      sourceTable,
      sourcePrimaryKey: row.source_primary_key,
      observedScopeKind: row.observed_scope_kind,
      observedScopeValue: row.observed_scope_value,
      referencedScopeKind: row.referenced_scope_kind,
      referencedScopeValue: row.referenced_scope_value,
      details: row.details,
    });
  }
}

let strictFailure = false;
try {
  await client.connect();
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout = '5min'");

  const databaseResult = await client.query<{
    database_name: string;
    database_oid: string;
    forbidden_neon_schemas: string[];
  }>(`
    SELECT
      current_database() AS database_name,
      (
        SELECT oid::text
        FROM pg_database
        WHERE datname = current_database()
      ) AS database_oid,
      ARRAY(
        SELECT namespace_name
        FROM unnest(ARRAY[
          'master', 'control', 'event', 'document', 'audit'
        ]::text[]) AS forbidden(namespace_name)
        WHERE to_regnamespace(namespace_name) IS NOT NULL
        ORDER BY namespace_name
      ) AS forbidden_neon_schemas
  `);

  const relationResult = await client.query<{
    relation_name: string;
    present: boolean;
  }>(
    `
      SELECT
        relation_name,
        to_regclass(relation_name) IS NOT NULL AS present
      FROM unnest($1::text[]) AS required(relation_name)
      ORDER BY relation_name
    `,
    [[...REQUIRED_RELATIONS]],
  );
  const missingRelations = relationResult.rows
    .filter((row) => !row.present)
    .map((row) => row.relation_name);

  let identityInventory: Array<Record<string, unknown>> = [];
  let identitySummary: Array<Record<string, unknown>> = [];
  let dispositions: DispositionRow[] = [];
  let captureProvenance: {
    plane: string;
    source_database_id: string;
    capture_contract_version: string;
    current_watermark: string;
    captured_at: Date;
  } | null = null;

  if (missingRelations.length === 0) {
    const captureResult = await client.query<{
      plane: string;
      source_database_id: string;
      capture_contract_version: string;
      current_watermark: string;
      captured_at: Date;
    }>(`
      SELECT
        plane_key AS plane,
        source_database_id,
        capture_contract_version,
        current_watermark,
        clock_timestamp() AS captured_at
      FROM mesh_log.authorization_capture_clock
      WHERE singleton_id = 1
    `);
    captureProvenance = captureResult.rows.length === 1
      ? captureResult.rows[0] ?? null
      : null;

    const identityInventoryResult = await client.query<{
      principal_id: string;
      principal_type: string;
      status: string;
      identity_binding_count: string;
      synced_identity_binding_count: string;
      active_grant_count: string;
      active_account_count: string;
    }>(`
      SELECT
        principal.id AS principal_id,
        principal.principal_type,
        principal.status,
        count(DISTINCT binding.id)::text AS identity_binding_count,
        count(DISTINCT binding.id) FILTER (
          WHERE binding.sync_status = 'synced'
        )::text AS synced_identity_binding_count,
        count(DISTINCT account_grant.id) FILTER (
          WHERE account_grant.status = 'active'
        )::text AS active_grant_count,
        count(DISTINCT account_grant.account_id) FILTER (
          WHERE account_grant.status = 'active'
        )::text AS active_account_count
      FROM mesh.principal AS principal
      LEFT JOIN mesh.principal_identity_binding AS binding
        ON binding.principal_id = principal.id
      LEFT JOIN mesh.account_grant AS account_grant
        ON account_grant.principal_id = principal.id
      WHERE principal.status = 'active'
        AND principal.principal_type IN (
          'participant_user', 'platform_staff', 'support_user'
        )
      GROUP BY principal.id, principal.principal_type, principal.status
      ORDER BY principal.principal_type, principal.id
    `);
    identityInventory = identityInventoryResult.rows;

    const identitySummaryResult = await client.query<{
      principal_type: string;
      principal_status: string;
      principal_count: string;
    }>(`
      SELECT
        principal_type,
        status AS principal_status,
        count(*)::text AS principal_count
      FROM mesh.principal
      GROUP BY principal_type, status
      ORDER BY principal_type, status
    `);
    identitySummary = identitySummaryResult.rows;

    await addCheck(
      "active_user_missing_identity_binding",
      "critical",
      "principal",
      `
        SELECT
          jsonb_build_object('id', principal.id) AS source_primary_key,
          'global'::text AS observed_scope_kind,
          NULL::jsonb AS observed_scope_value,
          'global'::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'principalType', principal.principal_type,
            'principalStatus', principal.status
          ) AS details
        FROM mesh.principal AS principal
        WHERE principal.status = 'active'
          AND principal.principal_type IN (
            'participant_user', 'platform_staff', 'support_user'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM mesh.principal_identity_binding AS binding
            WHERE binding.principal_id = principal.id
          )
        ORDER BY principal.id
      `,
    );

    await addCheck(
      "active_user_identity_binding_not_synced",
      "high",
      "principal_identity_binding",
      `
        SELECT
          jsonb_build_object('id', binding.id) AS source_primary_key,
          'global'::text AS observed_scope_kind,
          NULL::jsonb AS observed_scope_value,
          'global'::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'principalId', binding.principal_id,
            'providerCode', binding.provider_code,
            'realmKey', binding.realm_key,
            'syncStatus', binding.sync_status,
            'syncedAt', binding.synced_at
          ) AS details
        FROM mesh.principal_identity_binding AS binding
        JOIN mesh.principal AS principal
          ON principal.id = binding.principal_id
        WHERE principal.status = 'active'
          AND principal.principal_type IN (
            'participant_user', 'platform_staff', 'support_user'
          )
          AND binding.sync_status <> 'synced'
        ORDER BY binding.id
      `,
    );

    await addCheck(
      "identity_binding_missing_principal",
      "critical",
      "principal_identity_binding",
      `
        SELECT
          jsonb_build_object('id', binding.id) AS source_primary_key,
          'global'::text AS observed_scope_kind,
          NULL::jsonb AS observed_scope_value,
          'global'::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'principalId', binding.principal_id,
            'providerCode', binding.provider_code,
            'realmKey', binding.realm_key
          ) AS details
        FROM mesh.principal_identity_binding AS binding
        LEFT JOIN mesh.principal AS principal
          ON principal.id = binding.principal_id
        WHERE principal.id IS NULL
        ORDER BY binding.id
      `,
    );

    await addCheck(
      "active_participant_user_missing_active_account_grant",
      "critical",
      "principal",
      `
        SELECT
          jsonb_build_object('id', principal.id) AS source_primary_key,
          'global'::text AS observed_scope_kind,
          NULL::jsonb AS observed_scope_value,
          NULL::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'principalType', principal.principal_type,
            'principalStatus', principal.status
          ) AS details
        FROM mesh.principal AS principal
        WHERE principal.status = 'active'
          AND principal.principal_type = 'participant_user'
          AND NOT EXISTS (
            SELECT 1
            FROM mesh.account_grant AS account_grant
            WHERE account_grant.principal_id = principal.id
              AND account_grant.status = 'active'
          )
        ORDER BY principal.id
      `,
    );

    await addCheck(
      "account_grant_missing_account",
      "critical",
      "account_grant",
      `
        SELECT
          jsonb_build_object('id', account_grant.id) AS source_primary_key,
          'account_id'::text AS observed_scope_kind,
          jsonb_build_object('account_id', account_grant.account_id)
            AS observed_scope_value,
          'account_id'::text AS referenced_scope_kind,
          jsonb_build_object('account_id', account_grant.account_id)
            AS referenced_scope_value,
          jsonb_build_object(
            'principalId', account_grant.principal_id,
            'roleCode', account_grant.role_code,
            'grantStatus', account_grant.status
          ) AS details
        FROM mesh.account_grant AS account_grant
        LEFT JOIN mesh.network_account AS account
          ON account.id = account_grant.account_id
        WHERE account.id IS NULL
        ORDER BY account_grant.id
      `,
    );

    await addCheck(
      "account_grant_missing_principal",
      "critical",
      "account_grant",
      `
        SELECT
          jsonb_build_object('id', account_grant.id) AS source_primary_key,
          'account_id'::text AS observed_scope_kind,
          jsonb_build_object('account_id', account_grant.account_id)
            AS observed_scope_value,
          'global'::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'principalId', account_grant.principal_id,
            'roleCode', account_grant.role_code,
            'grantStatus', account_grant.status
          ) AS details
        FROM mesh.account_grant AS account_grant
        LEFT JOIN mesh.principal AS principal
          ON principal.id = account_grant.principal_id
        WHERE principal.id IS NULL
        ORDER BY account_grant.id
      `,
    );

    await addCheck(
      "active_grant_references_inactive_subject_or_account",
      "critical",
      "account_grant",
      `
        SELECT
          jsonb_build_object('id', account_grant.id) AS source_primary_key,
          'account_id'::text AS observed_scope_kind,
          jsonb_build_object('account_id', account_grant.account_id)
            AS observed_scope_value,
          'global'::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'principalId', account_grant.principal_id,
            'principalStatus', principal.status,
            'accountStatus', account.status,
            'roleCode', account_grant.role_code
          ) AS details
        FROM mesh.account_grant AS account_grant
        LEFT JOIN mesh.principal AS principal
          ON principal.id = account_grant.principal_id
        LEFT JOIN mesh.network_account AS account
          ON account.id = account_grant.account_id
        WHERE account_grant.status = 'active'
          AND (
            principal.id IS NULL
            OR principal.status <> 'active'
            OR account.id IS NULL
            OR account.status <> 'active'
          )
        ORDER BY account_grant.id
      `,
    );

    await addCheck(
      "multiple_active_account_roles",
      "high",
      "account_grant",
      `
        SELECT
          jsonb_build_object(
            'principal_id', account_grant.principal_id,
            'account_id', account_grant.account_id
          ) AS source_primary_key,
          'account_id'::text AS observed_scope_kind,
          jsonb_build_object('account_id', account_grant.account_id)
            AS observed_scope_value,
          NULL::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'principalId', account_grant.principal_id,
            'activeRoleCodes',
            jsonb_agg(account_grant.role_code ORDER BY account_grant.role_code)
          ) AS details
        FROM mesh.account_grant AS account_grant
        WHERE account_grant.status = 'active'
        GROUP BY account_grant.principal_id, account_grant.account_id
        HAVING count(DISTINCT account_grant.role_code) > 1
        ORDER BY account_grant.principal_id, account_grant.account_id
      `,
    );

    await addCheck(
      "account_grant_fingerprint_invalid",
      "high",
      "account_grant",
      `
        SELECT
          jsonb_build_object('id', account_grant.id) AS source_primary_key,
          'account_id'::text AS observed_scope_kind,
          jsonb_build_object('account_id', account_grant.account_id)
            AS observed_scope_value,
          NULL::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'principalId', account_grant.principal_id,
            'roleCode', account_grant.role_code,
            'fingerprintMissing', account_grant.fingerprint IS NULL,
            'fingerprintMismatch',
              account_grant.fingerprint IS DISTINCT FROM encode(
                public.digest(
                  account_grant.principal_id::text
                  || ':' || account_grant.account_id::text
                  || ':' || account_grant.role_code,
                  'sha256'
                ),
                'hex'
              )
          ) AS details
        FROM mesh.account_grant AS account_grant
        WHERE account_grant.fingerprint IS DISTINCT FROM encode(
          public.digest(
            account_grant.principal_id::text
            || ':' || account_grant.account_id::text
            || ':' || account_grant.role_code,
            'sha256'
          ),
          'hex'
        )
        ORDER BY account_grant.id
      `,
    );

    await addCheck(
      "attachment_acl_cross_account_subject",
      "high",
      "attachment_acl",
      `
        SELECT
          jsonb_build_object('id', acl.id) AS source_primary_key,
          'account_code'::text AS observed_scope_kind,
          jsonb_build_object('account_code', acl.account_code)
            AS observed_scope_value,
          'account_code'::text AS referenced_scope_kind,
          jsonb_build_object('account_code', acl.grantee_account_code)
            AS referenced_scope_value,
          jsonb_build_object(
            'attachmentId', acl.attachment_id,
            'permission', acl.permission,
            'isGranted', acl.is_granted,
            'expiresAt', acl.expires_at
          ) AS details
        FROM mesh.attachment_acl AS acl
        WHERE acl.grantee_account_code IS NOT NULL
          AND acl.grantee_account_code <> acl.account_code
          AND acl.is_granted
          AND (acl.expires_at IS NULL OR acl.expires_at > now())
        ORDER BY acl.id
      `,
    );

    await addCheck(
      "attachment_acl_principal_without_resource_account_grant",
      "critical",
      "attachment_acl",
      `
        SELECT
          jsonb_build_object('id', acl.id) AS source_primary_key,
          'account_code'::text AS observed_scope_kind,
          jsonb_build_object('account_code', acl.account_code)
            AS observed_scope_value,
          'global'::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'attachmentId', acl.attachment_id,
            'granteePrincipalId', acl.grantee_principal_id,
            'permission', acl.permission
          ) AS details
        FROM mesh.attachment_acl AS acl
        JOIN mesh.network_account AS resource_account
          ON resource_account.account_code = acl.account_code
        WHERE acl.grantee_principal_id IS NOT NULL
          AND acl.is_granted
          AND (acl.expires_at IS NULL OR acl.expires_at > now())
          AND NOT EXISTS (
            SELECT 1
            FROM mesh.account_grant AS account_grant
            WHERE account_grant.account_id = resource_account.id
              AND account_grant.principal_id = acl.grantee_principal_id
              AND account_grant.status = 'active'
          )
        ORDER BY acl.id
      `,
    );

    await addCheck(
      "content_access_grant_cross_account_subject",
      "high",
      "content_item_access_grant",
      `
        SELECT
          jsonb_build_object('id', access_grant.id) AS source_primary_key,
          'account_code'::text AS observed_scope_kind,
          jsonb_build_object('account_code', access_grant.account_code)
            AS observed_scope_value,
          'account_code'::text AS referenced_scope_kind,
          jsonb_build_object(
            'account_code',
            access_grant.subject_account_code
          ) AS referenced_scope_value,
          jsonb_build_object(
            'contentItemId', access_grant.content_item_id,
            'accessLevel', access_grant.access_level,
            'expiresAt', access_grant.expires_at
          ) AS details
        FROM mesh.content_item_access_grant AS access_grant
        WHERE access_grant.subject_type = 'account'
          AND access_grant.subject_account_code <> access_grant.account_code
          AND (
            access_grant.expires_at IS NULL
            OR access_grant.expires_at > now()
          )
        ORDER BY access_grant.id
      `,
    );

    await addCheck(
      "content_access_principal_without_resource_account_grant",
      "critical",
      "content_item_access_grant",
      `
        SELECT
          jsonb_build_object('id', access_grant.id) AS source_primary_key,
          'account_code'::text AS observed_scope_kind,
          jsonb_build_object('account_code', access_grant.account_code)
            AS observed_scope_value,
          'global'::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'contentItemId', access_grant.content_item_id,
            'subjectPrincipalId', access_grant.subject_principal_id,
            'accessLevel', access_grant.access_level
          ) AS details
        FROM mesh.content_item_access_grant AS access_grant
        JOIN mesh.network_account AS resource_account
          ON resource_account.account_code = access_grant.account_code
        WHERE access_grant.subject_type = 'principal'
          AND (
            access_grant.expires_at IS NULL
            OR access_grant.expires_at > now()
          )
          AND NOT EXISTS (
            SELECT 1
            FROM mesh.account_grant AS account_grant
            WHERE account_grant.account_id = resource_account.id
              AND account_grant.principal_id
                  = access_grant.subject_principal_id
              AND account_grant.status = 'active'
          )
        ORDER BY access_grant.id
      `,
    );

    await addCheck(
      "conversation_participant_cross_account",
      "high",
      "conversation_participant",
      `
        SELECT
          jsonb_build_object('id', participant.id) AS source_primary_key,
          'account_code'::text AS observed_scope_kind,
          jsonb_build_object(
            'account_code',
            conversation.owner_account_code
          ) AS observed_scope_value,
          'account_code'::text AS referenced_scope_kind,
          jsonb_build_object(
            'account_code',
            participant.participant_account_code
          ) AS referenced_scope_value,
          jsonb_build_object(
            'conversationId', participant.conversation_id,
            'principalId', participant.principal_id,
            'participantRole', participant.role
          ) AS details
        FROM mesh.conversation_participant AS participant
        JOIN mesh.conversation AS conversation
          ON conversation.id = participant.conversation_id
        WHERE participant.left_at IS NULL
          AND participant.participant_account_code
              <> conversation.owner_account_code
        ORDER BY participant.id
      `,
    );

    await addCheck(
      "conversation_principal_without_participant_account_grant",
      "critical",
      "conversation_participant",
      `
        SELECT
          jsonb_build_object('id', participant.id) AS source_primary_key,
          'account_code'::text AS observed_scope_kind,
          jsonb_build_object(
            'account_code',
            participant.participant_account_code
          ) AS observed_scope_value,
          'global'::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'conversationId', participant.conversation_id,
            'principalId', participant.principal_id,
            'participantRole', participant.role
          ) AS details
        FROM mesh.conversation_participant AS participant
        JOIN mesh.network_account AS participant_account
          ON participant_account.account_code
             = participant.participant_account_code
        WHERE participant.left_at IS NULL
          AND participant.principal_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM mesh.account_grant AS account_grant
            WHERE account_grant.account_id = participant_account.id
              AND account_grant.principal_id = participant.principal_id
              AND account_grant.status = 'active'
          )
        ORDER BY participant.id
      `,
    );

    await addCheck(
      "active_relationship_references_inactive_account",
      "high",
      "network_relationship",
      `
        SELECT
          jsonb_build_object('id', relationship.id) AS source_primary_key,
          'account_pair'::text AS observed_scope_kind,
          jsonb_build_object(
            'buyer_account_code', relationship.buyer_account_code,
            'supplier_account_code', relationship.supplier_account_code
          ) AS observed_scope_value,
          NULL::text AS referenced_scope_kind,
          NULL::jsonb AS referenced_scope_value,
          jsonb_build_object(
            'relationshipCode', relationship.relationship_code,
            'buyerStatus', buyer.status,
            'supplierStatus', supplier.status
          ) AS details
        FROM mesh.network_relationship AS relationship
        LEFT JOIN mesh.network_account AS buyer
          ON buyer.account_code = relationship.buyer_account_code
        LEFT JOIN mesh.network_account AS supplier
          ON supplier.account_code = relationship.supplier_account_code
        WHERE relationship.status = 'active'
          AND (
            buyer.id IS NULL
            OR buyer.status <> 'active'
            OR supplier.id IS NULL
            OR supplier.status <> 'active'
          )
        ORDER BY relationship.id
      `,
    );

    const dispositionResult = await client.query<DispositionRow>(`
      SELECT
        finding_fingerprint,
        finding_kind,
        severity,
        source_schema,
        source_table,
        classification,
        owner_team,
        reason,
        remediation,
        approval_ticket,
        approved_by,
        approved_at,
        resolved_at
      FROM mesh_control.authorization_anomaly_disposition
      ORDER BY finding_fingerprint
    `);
    dispositions = dispositionResult.rows;
  }

  findings.sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
  const dispositionByFingerprint = new Map(
    dispositions.map((row) => [row.finding_fingerprint, row]),
  );
  const reconciledFindings = findings.map((finding) => {
    const disposition = dispositionByFingerprint.get(finding.fingerprint);
    const shapeMatches = disposition !== undefined
      && disposition.finding_kind === finding.kind
      && disposition.severity === finding.severity
      && disposition.source_schema === finding.sourceSchema
      && disposition.source_table === finding.sourceTable;
    const resolutionSatisfied = disposition !== undefined
      && (
        !["repair_before_backfill", "quarantine"]
          .includes(disposition.classification)
        || disposition.resolved_at !== null
      );
    return {
      ...finding,
      disposition: disposition ?? null,
      dispositionApproved: shapeMatches && resolutionSatisfied,
    };
  });
  const unclassifiedFindings = reconciledFindings.filter(
    (finding) => !finding.dispositionApproved,
  );
  const currentFingerprints = new Set(
    findings.map((finding) => finding.fingerprint),
  );
  const staleDispositions = dispositions.filter(
    (row) => !currentFingerprints.has(row.finding_fingerprint),
  );
  const databaseIdentity = databaseResult.rows[0];
  if (!databaseIdentity) {
    throw new Error("Mesh database identity query returned no row.");
  }

  const activeUserPopulation = identityInventory.length;
  const blockingReasons = [
    ...(databaseIdentity.forbidden_neon_schemas.length > 0
      ? ["forbidden_neon_schema_present"]
      : []),
    ...(missingRelations.length > 0 ? ["required_relation_missing"] : []),
    ...(captureProvenance === null || captureProvenance.plane !== "mesh"
      ? ["capture_provenance_missing_or_wrong_plane"]
      : []),
    ...(unclassifiedFindings.length > 0
      ? ["unclassified_or_unresolved_data_quality_finding"]
      : []),
  ];
  strictFailure = blockingReasons.length > 0;

  const report = {
    schemaVersion: "wave0.mesh-authorization-data-quality-report.v1",
    generatedAt: new Date().toISOString(),
    plane: "mesh",
    readOnly: true,
    strict: options.strict,
    gate: {
      passed: !strictFailure,
      blockingReasons,
    },
    summary: {
      requiredRelationCount: REQUIRED_RELATIONS.length,
      missingRelationCount: missingRelations.length,
      activeUserInventoryCount: activeUserPopulation,
      findingCount: reconciledFindings.length,
      approvedDispositionCount:
        reconciledFindings.length - unclassifiedFindings.length,
      unclassifiedOrUnresolvedFindingCount: unclassifiedFindings.length,
      staleDispositionCount: staleDispositions.length,
    },
    databaseIdentity,
    captureProvenance,
    requiredRelations: relationResult.rows,
    missingRelations,
    identityInventoryDefinition: {
      status: "active",
      principalTypes: [
        "participant_user",
        "platform_staff",
        "support_user",
      ],
      externalSubjectValuesEmitted: false,
    },
    activeUserIdentityInventory: identityInventory,
    principalPopulationByTypeAndStatus: identitySummary,
    findings: reconciledFindings,
    unclassifiedOrUnresolvedFindings: unclassifiedFindings,
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
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end().catch(() => undefined);
}

if (options.strict && strictFailure) {
  process.exitCode = 2;
}
