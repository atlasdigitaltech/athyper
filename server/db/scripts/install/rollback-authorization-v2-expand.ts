#!/usr/bin/env tsx
/**
 * Safe pre-backfill rollback for the Neon/Admin Wave 1 additive expansion.
 *
 * Dry-run is the default. Destructive uninstall is allowed only before any
 * snapshot/backfill/replay or target business row exists. Wave 0 capture is
 * locked and reconciled before commit. Once backfill begins, rollback means
 * atomically selecting legacy readers/writers while retaining shadow data;
 * this script refuses to run.
 */

import pg from "pg";

interface Options {
  apply: boolean;
  expectedDatabase?: string;
  approvalTicket?: string;
  confirmation?: string;
}

interface CaptureState {
  source_database_id: string;
  capture_contract_version: string;
  current_watermark: string;
  change_event_count: string;
  transaction_count: string;
  snapshot_marker_count: string;
  registered_source_count: string;
  invalid_capture_trigger_count: string;
}

const expectedConfirmation = "PRE_BACKFILL_EXPAND_ROLLBACK";
const options = parseOptions(process.argv.slice(2));

if (!options.apply) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "dry_run",
    mutatesDatabase: false,
    rollbackClass: "pre_backfill_expand_uninstall_only",
    requiredApplyArguments: [
      "--apply",
      "--expected-database=<exact name>",
      "--approval-ticket=<ticket>",
      `--confirm=${expectedConfirmation}`,
    ],
    refusalConditions: [
      "snapshot marker or snapshot/backfill state exists after expansion",
      "replay binding/inbox/application exists",
      "conservation, transformer, invalidation, or decision evidence exists",
      "any canonical target business row exists",
      "entity_operation v2 data exists",
      "Wave 0 capture is absent or unhealthy",
    ],
    preserves: [
      "event.authorization_capture_clock",
      "event.authorization_change_transaction",
      "event.authorization_change_event",
      "event.authorization_snapshot_marker",
      "event.authorization_projection_checkpoint",
      "control.authorization_capture_source",
      "all legacy authority tables and columns",
    ],
    postBackfillRollback:
      "atomic selector/read-write swap to legacy; retain all v2 shadow data "
      + "and capture/replay evidence for diagnosis and forward repair",
  }, null, 2)}\n`);
  process.exit(0);
}

if (
  !options.expectedDatabase
  || !options.approvalTicket
  || options.confirmation !== expectedConfirmation
) {
  throw new Error(
    "--apply requires --expected-database, --approval-ticket, and "
    + `--confirm=${expectedConfirmation}.`,
  );
}

const connectionString =
  process.env.AUTHORIZATION_V2_DATABASE_URL?.trim()
  ?? process.env.DATABASE_ADMIN_URL?.trim();
if (!connectionString) {
  throw new Error(
    "AUTHORIZATION_V2_DATABASE_URL or DATABASE_ADMIN_URL is required.",
  );
}

const client = new pg.Client({
  connectionString,
  application_name: "wave1-authorization-v2-prebackfill-rollback",
});

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '30s'");
  await client.query("SET LOCAL statement_timeout = '10min'");
  await client.query(
    "SELECT set_config('app.authorization_v2_prebackfill_rollback_ticket', $1, true)",
    [options.approvalTicket],
  );
  await client.query(
    "SELECT set_config('app.authorization_v2_prebackfill_rollback_confirm', $1, true)",
    [expectedConfirmation],
  );

  const identity = (await client.query<{
    database_name: string;
    mesh_schema_present: boolean;
  }>(`
    SELECT
      current_database() AS database_name,
      to_regnamespace('mesh') IS NOT NULL
        OR to_regnamespace('mesh_control') IS NOT NULL
        OR to_regnamespace('mesh_log') IS NOT NULL
        AS mesh_schema_present
  `)).rows[0];
  if (!identity || identity.database_name !== options.expectedDatabase) {
    throw new Error(
      `Database mismatch: expected ${options.expectedDatabase}, `
      + `got ${identity?.database_name ?? "unknown"}.`,
    );
  }
  if (identity.mesh_schema_present) {
    throw new Error("Pre-backfill rollback is sealed to Neon/Admin.");
  }

  const installation = (await client.query<{
    installed_at: string;
    installation_count: string;
  }>(`
    SELECT
      min(installed_at)::text AS installed_at,
      count(*)::text AS installation_count
    FROM control.authorization_v2_expand_installation
    WHERE expand_contract_version = 'wave1.authz-v2-expand.v1'
  `)).rows[0];
  if (
    !installation
    || installation.installation_count === "0"
    || !installation.installed_at
  ) {
    throw new Error("No Wave 1 expand receipt exists.");
  }

  // The clock lock waits for in-flight captured writes and prevents another
  // capture watermark allocation until preservation has been rechecked.
  await client.query(
    "LOCK TABLE event.authorization_capture_clock IN SHARE MODE",
  );
  const captureBefore = await readCaptureState(client);
  assertCaptureHealthy(captureBefore);

  const migrationActivity = (await client.query<{
    marker_count: string;
    started_run_count: string;
    replay_row_count: string;
    conservation_count: string;
    transformer_count: string;
  }>(`
    SELECT
      (
        SELECT count(*)::text
        FROM event.authorization_snapshot_marker
        WHERE recorded_at >= $1::timestamptz
      ) AS marker_count,
      (
        SELECT count(*)::text
        FROM control.authorization_migration_run
        WHERE snapshot_started_at >= $1::timestamptz
           OR snapshot_completed_at >= $1::timestamptz
           OR (
             snapshot_watermark IS NOT NULL
             AND created_at >= $1::timestamptz
           )
      ) AS started_run_count,
      (
        SELECT
          (SELECT count(*) FROM event.authorization_v2_replay_binding)
          + (SELECT count(*) FROM event.authorization_v2_replay_transaction)
          + (SELECT count(*) FROM event.authorization_v2_replay_inbox)
          + (SELECT count(*) FROM event.authorization_v2_replay_application)
      )::text AS replay_row_count,
      (
        SELECT count(*)::text
        FROM control.authorization_v2_conservation_ledger
      ) AS conservation_count,
      (
        SELECT count(*)::text
        FROM control.authorization_v2_transformer_registry
      ) AS transformer_count
  `, [installation.installed_at])).rows[0];
  if (
    !migrationActivity
    || Object.values(migrationActivity).some((count) => count !== "0")
  ) {
    throw new Error(
      "Snapshot/backfill/replay state exists. Destructive uninstall is "
      + "forbidden; swap selectors to legacy and retain v2 shadows. "
      + JSON.stringify(migrationActivity),
    );
  }

  const businessRows = await client.query<{
    relation_name: string;
    row_count: string;
  }>(`
    SELECT relation_name, row_count::text
    FROM (
      SELECT 'control.auth_plane.unexpected',
             (
               count(*) FILTER (
                 WHERE (id, plane_code) NOT IN (
                   ('00000000-0000-7000-8000-000000000001'::uuid, 'neon'),
                   ('00000000-0000-7000-8000-000000000002'::uuid, 'admin')
                 )
               )
               + abs(count(*) - 2)
             )::bigint
      FROM control.auth_plane
      UNION ALL
      SELECT 'control.auth_catalog_owner.unexpected',
             (
               count(*) FILTER (
                 WHERE id <>
                   '00000000-0000-7000-8000-000000000010'::uuid
                    OR owner_kind <> 'platform'
                    OR tenant_id IS NOT NULL
                    OR owner_code <> 'platform'
               )
               + abs(count(*) - 1)
             )::bigint
      FROM control.auth_catalog_owner
      UNION ALL SELECT 'control.auth_permission', count(*)
        FROM control.auth_permission
      UNION ALL SELECT 'control.auth_permission_plane', count(*)
        FROM control.auth_permission_plane
      UNION ALL SELECT 'control.auth_permission_scope_policy', count(*)
        FROM control.auth_permission_scope_policy
      UNION ALL SELECT 'control.entity_operation_plane', count(*)
        FROM control.entity_operation_plane
      UNION ALL SELECT 'control.entity_scope_binding', count(*)
        FROM control.entity_scope_binding
      UNION ALL SELECT 'control.entity_operation.v2_rows', count(*)
        FROM control.entity_operation
        WHERE num_nonnulls(
          catalog_owner_id_v2,
          entity_id_v2,
          entity_version_id_v2,
          operation_code_v2,
          permission_id_v2,
          v2_publication_status,
          v2_effective_from,
          v2_effective_until,
          v2_operation_kind,
          v2_idempotency_mode,
          v2_risk_tier,
          v2_requires_mfa,
          v2_requires_sod,
          v2_is_shareable,
          v2_is_delegable
        ) > 0
      UNION ALL SELECT 'master.auth_plane_membership', count(*)
        FROM master.auth_plane_membership
      UNION ALL SELECT 'master.auth_scope_target', count(*)
        FROM master.auth_scope_target
      UNION ALL SELECT 'master.auth_scope_tenant', count(*)
        FROM master.auth_scope_tenant
      UNION ALL SELECT 'master.auth_scope_company', count(*)
        FROM master.auth_scope_company
      UNION ALL SELECT 'master.auth_scope_legal_entity', count(*)
        FROM master.auth_scope_legal_entity
      UNION ALL SELECT 'master.auth_scope_operating_organization', count(*)
        FROM master.auth_scope_operating_organization
      UNION ALL SELECT 'master.auth_permission_set', count(*)
        FROM master.auth_permission_set
      UNION ALL SELECT 'master.auth_permission_set_rule', count(*)
        FROM master.auth_permission_set_rule
      UNION ALL SELECT 'master.auth_role', count(*) FROM master.auth_role
      UNION ALL SELECT 'master.auth_role_compilation', count(*)
        FROM master.auth_role_compilation
      UNION ALL SELECT 'master.auth_role_permission_set', count(*)
        FROM master.auth_role_permission_set
      UNION ALL SELECT 'master.auth_role_permission', count(*)
        FROM master.auth_role_permission
      UNION ALL SELECT 'master.auth_group_v2', count(*)
        FROM master.auth_group_v2
      UNION ALL SELECT 'master.auth_group_member_v2', count(*)
        FROM master.auth_group_member_v2
      UNION ALL SELECT 'master.auth_group_role_v2', count(*)
        FROM master.auth_group_role_v2
      UNION ALL SELECT 'master.auth_deny_rule', count(*)
        FROM master.auth_deny_rule
      UNION ALL SELECT 'master.auth_deny_rule_principal', count(*)
        FROM master.auth_deny_rule_principal
      UNION ALL SELECT 'master.auth_deny_rule_group', count(*)
        FROM master.auth_deny_rule_group
      UNION ALL SELECT 'master.auth_deny_rule_hard_policy', count(*)
        FROM master.auth_deny_rule_hard_policy
      UNION ALL SELECT 'master.auth_override', count(*)
        FROM master.auth_override
      UNION ALL SELECT 'master.auth_record_acl', count(*)
        FROM master.auth_record_acl
      UNION ALL SELECT 'master.auth_record_acl_permission', count(*)
        FROM master.auth_record_acl_permission
      UNION ALL SELECT 'master.auth_delegation', count(*)
        FROM master.auth_delegation
      UNION ALL SELECT 'master.auth_delegation_permission', count(*)
        FROM master.auth_delegation_permission
      UNION ALL SELECT 'master.auth_delegation_permission_scope', count(*)
        FROM master.auth_delegation_permission_scope
      UNION ALL SELECT 'master.tenant_entitlement_override', count(*)
        FROM master.tenant_entitlement_override
      UNION ALL SELECT 'event.authorization_tenant_epoch_v2', count(*)
        FROM event.authorization_tenant_epoch_v2
      UNION ALL SELECT 'event.authorization_plane_epoch_v2', count(*)
        FROM event.authorization_plane_epoch_v2
      UNION ALL SELECT 'event.authorization_invalidation_outbox_v2', count(*)
        FROM event.authorization_invalidation_outbox_v2
      UNION ALL SELECT 'event.authorization_global_epoch_v2.nonzero',
             count(*) FILTER (WHERE singleton_id <> 1 OR epoch <> 0)
        FROM event.authorization_global_epoch_v2
      UNION ALL SELECT 'log.auth_decision_evidence_v2', count(*)
        FROM log.auth_decision_evidence_v2
    ) AS target
    WHERE row_count <> 0
    ORDER BY relation_name
  `);
  if (businessRows.rows.length > 0) {
    throw new Error(
      "Canonical target business rows exist. Destructive uninstall is "
      + "forbidden; swap selectors to legacy and retain v2 shadows. "
      + JSON.stringify(businessRows.rows),
    );
  }

  await client.query(`
    DO $guard$
    BEGIN
      IF btrim(COALESCE(current_setting(
        'app.authorization_v2_prebackfill_rollback_ticket',
        true
      ), '')) = '' THEN
        RAISE EXCEPTION 'Rollback approval GUC is required';
      END IF;
      IF current_setting(
        'app.authorization_v2_prebackfill_rollback_confirm',
        true
      ) IS DISTINCT FROM 'PRE_BACKFILL_EXPAND_ROLLBACK' THEN
        RAISE EXCEPTION 'Exact rollback confirmation GUC is required';
      END IF;
    END
    $guard$;

    DROP VIEW IF EXISTS
      event.v_authorization_invalidation_health_v2,
      event.v_authorization_replay_health_v2,
      control.v_authorization_v2_operation_publication,
      control.v_authorization_v2_deferred_constraints,
      master.auth_scope_target_resolved_v,
      master.auth_current_plane_membership_v,
      master.auth_published_role_permission_v,
      master.auth_current_group_member_v,
      master.auth_current_group_role_v,
      master.auth_current_delegation_permission_scope_v;

    DO $triggers$
    DECLARE
      v_trigger record;
    BEGIN
      FOR v_trigger IN
        SELECT
          namespace_record.nspname AS schema_name,
          table_record.relname AS table_name,
          trigger_record.tgname AS trigger_name
        FROM pg_trigger AS trigger_record
        JOIN pg_class AS table_record
          ON table_record.oid = trigger_record.tgrelid
        JOIN pg_namespace AS namespace_record
          ON namespace_record.oid = table_record.relnamespace
        WHERE NOT trigger_record.tgisinternal
          AND (
            format('%I.%I', namespace_record.nspname, table_record.relname)
              IN (
                'control.auth_plane',
                'control.auth_catalog_owner',
                'control.auth_permission',
                'control.auth_permission_plane',
                'control.auth_permission_scope_policy',
                'control.entity_operation_plane',
                'control.entity_scope_binding',
                'master.auth_plane_membership',
                'master.auth_scope_target',
                'master.auth_scope_tenant',
                'master.auth_scope_company',
                'master.auth_scope_legal_entity',
                'master.auth_scope_operating_organization',
                'master.auth_permission_set',
                'master.auth_permission_set_rule',
                'master.auth_role',
                'master.auth_role_compilation',
                'master.auth_role_permission_set',
                'master.auth_role_permission',
                'master.auth_group_v2',
                'master.auth_group_member_v2',
                'master.auth_group_role_v2',
                'master.auth_deny_rule',
                'master.auth_deny_rule_principal',
                'master.auth_deny_rule_group',
                'master.auth_deny_rule_hard_policy',
                'master.auth_override',
                'master.auth_record_acl',
                'master.auth_record_acl_permission',
                'master.auth_delegation',
                'master.auth_delegation_permission',
                'master.auth_delegation_permission_scope',
                'master.tenant_entitlement_override',
                'event.authorization_invalidation_outbox_v2',
                'event.authorization_v2_replay_binding',
                'event.authorization_v2_replay_transaction',
                'event.authorization_v2_replay_inbox',
                'event.authorization_v2_replay_application',
                'log.auth_decision_evidence_v2',
                'log.auth_decision_evidence_v2_default'
              )
            OR (
              namespace_record.nspname = 'control'
              AND table_record.relname = 'entity_operation'
              AND trigger_record.tgname IN (
                'trg_entity_operation_v2_publish_guard',
                'trg_authorization_v2_invalidate'
              )
            )
            OR (
              format(
                '%I.%I',
                namespace_record.nspname,
                table_record.relname
              ) IN (
                'shared.module',
                'shared.enterprise_feature',
                'shared.subscription_plan',
                'shared.subscription_plan_version',
                'shared.plan_module_access',
                'shared.plan_feature_access',
                'control.entity',
                'control.entity_version',
                'master.tenant',
                'master.principal',
                'master.principal_identity_binding',
                'master.tenant_module_subscription',
                'master.tenant_feature_entitlement'
              )
              AND trigger_record.tgname = 'trg_authorization_v2_invalidate'
            )
          )
      LOOP
        EXECUTE format(
          'DROP TRIGGER %I ON %I.%I',
          v_trigger.trigger_name,
          v_trigger.schema_name,
          v_trigger.table_name
        );
      END LOOP;
    END
    $triggers$;

    DO $functions$
    DECLARE
      v_function regprocedure;
    BEGIN
      FOR v_function IN
        SELECT function_record.oid::regprocedure
        FROM pg_proc AS function_record
        JOIN pg_namespace AS namespace_record
          ON namespace_record.oid = function_record.pronamespace
        WHERE (namespace_record.nspname, function_record.proname) IN (
          ('control', 'authorization_v2_is_effective'),
          ('control', 'authorization_v2_window_contains'),
          ('control', 'authorization_v2_catalog_entity_aligned'),
          ('control', 'trg_authorization_v2_guard_permission'),
          ('control', 'trg_authorization_v2_guard_scope_policy'),
          ('control', 'trg_authorization_v2_guard_entity_operation'),
          ('control', 'trg_authorization_v2_guard_operation_plane'),
          ('control', 'trg_authorization_v2_guard_scope_binding'),
          ('master', 'current_auth_plane_code_soft'),
          ('master', 'current_auth_plane_code'),
          ('master', 'auth_v2_permission_is_effective'),
          ('master', 'auth_v2_principal_has_plane'),
          ('master', 'trg_auth_plane_membership_guard'),
          ('master', 'trg_auth_v2_retention_guard'),
          ('master', 'trg_auth_scope_target_guard'),
          ('master', 'trg_auth_scope_child_guard'),
          ('master', 'trg_auth_permission_set_guard'),
          ('master', 'trg_auth_permission_set_rule_guard'),
          ('master', 'trg_auth_role_guard'),
          ('master', 'trg_auth_role_compilation_guard'),
          ('master', 'trg_auth_compilation_child_guard'),
          ('master', 'publish_auth_role_compilation'),
          ('master', 'trg_auth_group_guard'),
          ('master', 'trg_auth_group_member_guard'),
          ('master', 'trg_auth_group_role_guard'),
          ('master', 'trg_auth_deny_rule_guard'),
          ('master', 'trg_auth_deny_binding_guard'),
          ('master', 'trg_auth_override_guard'),
          ('master', 'trg_auth_record_acl_guard'),
          ('master', 'trg_auth_record_acl_permission_guard'),
          ('master', 'trg_auth_delegation_guard'),
          ('master', 'trg_auth_delegation_child_guard'),
          ('master', 'trg_tenant_entitlement_override_guard'),
          ('event', 'fn_authorization_v2_safe_uuid'),
          ('event', 'fn_authorization_v2_safe_timestamptz'),
          ('event', 'fn_authorization_v2_json_uuid_values'),
          ('event', 'fn_authorization_v2_source_row_key'),
          ('event', 'fn_authorization_bump_epoch_v2'),
          ('event', 'fn_authorization_emit_invalidation_v2'),
          ('event', 'fn_authorization_supersede_scheduled_v2'),
          ('event', 'fn_authorization_claim_invalidations_v2'),
          ('event', 'fn_authorization_complete_invalidation_v2'),
          ('event', 'fn_authorization_fail_invalidation_v2'),
          ('event', 'trg_authorization_invalidation_immutable_v2'),
          ('event', 'trg_authorization_authority_invalidate_v2'),
          ('event', 'fn_authorization_bind_replay_v2'),
          ('event', 'fn_authorization_stage_replay_v2'),
          ('event', 'fn_authorization_begin_replay_v2'),
          ('event', 'fn_authorization_set_replay_event_context_v2'),
          ('event', 'fn_authorization_complete_replay_v2'),
          ('event', 'trg_authorization_v2_replay_inbox_immutable'),
          ('event', 'trg_authorization_v2_replay_state_guard'),
          ('log', 'trg_auth_decision_evidence_v2_immutable')
        )
      LOOP
        EXECUTE format('DROP FUNCTION %s', v_function);
      END LOOP;
    END
    $functions$;

    DO $constraints$
    DECLARE
      v_constraint text;
    BEGIN
      FOREACH v_constraint IN ARRAY ARRAY[
        'eo_v2_publication_status_chk',
        'eo_v2_operation_code_chk',
        'eo_v2_effective_chk',
        'eo_v2_operation_kind_chk',
        'eo_v2_idempotency_chk',
        'eo_v2_risk_chk',
        'eo_v2_publish_complete_chk',
        'eo_catalog_owner_v2_fk',
        'eo_entity_v2_fk',
        'eo_entity_version_v2_fk',
        'eo_permission_v2_fk',
        'eo_exact_permission_v2_fk',
        'eo_entity_version_alignment_v2_fk',
        'eo_id_permission_v2_uq',
        'eo_owner_entity_id_v2_uq',
        'eo_v2_published_window_excl'
      ]
      LOOP
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'control.entity_operation'::regclass
            AND conname = v_constraint
        ) THEN
          EXECUTE format(
            'ALTER TABLE control.entity_operation DROP CONSTRAINT %I',
            v_constraint
          );
        END IF;
      END LOOP;

      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'control.entity_version'::regclass
          AND conname = 'ev_entity_id_id_uq'
      ) THEN
        ALTER TABLE control.entity_version
          DROP CONSTRAINT ev_entity_id_id_uq;
      END IF;
    END
    $constraints$;

    ALTER TABLE control.entity_operation
      DROP COLUMN IF EXISTS catalog_owner_id_v2,
      DROP COLUMN IF EXISTS entity_id_v2,
      DROP COLUMN IF EXISTS entity_version_id_v2,
      DROP COLUMN IF EXISTS operation_code_v2,
      DROP COLUMN IF EXISTS permission_id_v2,
      DROP COLUMN IF EXISTS v2_publication_status,
      DROP COLUMN IF EXISTS v2_effective_from,
      DROP COLUMN IF EXISTS v2_effective_until,
      DROP COLUMN IF EXISTS v2_operation_kind,
      DROP COLUMN IF EXISTS v2_idempotency_mode,
      DROP COLUMN IF EXISTS v2_risk_tier,
      DROP COLUMN IF EXISTS v2_requires_mfa,
      DROP COLUMN IF EXISTS v2_requires_sod,
      DROP COLUMN IF EXISTS v2_is_shareable,
      DROP COLUMN IF EXISTS v2_is_delegable;

    DROP TABLE IF EXISTS
      log.auth_decision_evidence_v2,
      event.authorization_v2_replay_application,
      event.authorization_v2_replay_inbox,
      event.authorization_v2_replay_transaction,
      event.authorization_v2_replay_binding,
      event.authorization_invalidation_outbox_v2,
      event.authorization_plane_epoch_v2,
      event.authorization_tenant_epoch_v2,
      event.authorization_global_epoch_v2,
      master.tenant_entitlement_override,
      master.auth_delegation_permission_scope,
      master.auth_delegation_permission,
      master.auth_delegation,
      master.auth_record_acl_permission,
      master.auth_record_acl,
      master.auth_override,
      master.auth_deny_rule_hard_policy,
      master.auth_deny_rule_group,
      master.auth_deny_rule_principal,
      master.auth_deny_rule,
      master.auth_group_role_v2,
      master.auth_group_member_v2,
      master.auth_group_v2,
      master.auth_role_permission,
      master.auth_role_permission_set,
      master.auth_role_compilation,
      master.auth_role,
      master.auth_permission_set_rule,
      master.auth_permission_set,
      master.auth_scope_operating_organization,
      master.auth_scope_legal_entity,
      master.auth_scope_company,
      master.auth_scope_tenant,
      master.auth_scope_target,
      master.auth_plane_membership,
      control.entity_scope_binding,
      control.entity_operation_plane,
      control.auth_permission_scope_policy,
      control.auth_permission_plane,
      control.auth_permission,
      control.auth_catalog_owner,
      control.auth_plane,
      control.authorization_v2_conservation_ledger,
      control.authorization_v2_deferred_constraint_registry,
      control.authorization_v2_transformer_registry,
      control.authorization_v2_frozen_legacy_object,
      control.authorization_v2_expand_installation;

    REVOKE SELECT ON TABLE control.entity_operation FROM athyperapp;
    GRANT SELECT ON TABLE control.entity_operation TO athyperapp;
  `);

  const captureAfter = await readCaptureState(client);
  assertCaptureHealthy(captureAfter);
  if (JSON.stringify(captureAfter) !== JSON.stringify(captureBefore)) {
    throw new Error(
      "Wave 0 capture changed during rollback; transaction will be rolled back. "
      + JSON.stringify({ before: captureBefore, after: captureAfter }),
    );
  }

  const legacyShape = (await client.query<{
    v2_column_count: string;
    legacy_select: boolean;
    wave0_object_count: string;
  }>(`
    SELECT
      (
        SELECT count(*)::text
        FROM information_schema.columns
        WHERE table_schema = 'control'
          AND table_name = 'entity_operation'
          AND column_name = ANY(ARRAY[
            'catalog_owner_id_v2',
            'entity_id_v2',
            'entity_version_id_v2',
            'operation_code_v2',
            'permission_id_v2',
            'v2_publication_status',
            'v2_effective_from',
            'v2_effective_until',
            'v2_operation_kind',
            'v2_idempotency_mode',
            'v2_risk_tier',
            'v2_requires_mfa',
            'v2_requires_sod',
            'v2_is_shareable',
            'v2_is_delegable'
          ])
      ) AS v2_column_count,
      has_table_privilege(
        'athyperapp',
        'control.entity_operation',
        'SELECT'
      ) AS legacy_select,
      (
        SELECT count(*)::text
        FROM unnest(ARRAY[
          to_regclass('event.authorization_capture_clock'),
          to_regclass('event.authorization_change_transaction'),
          to_regclass('event.authorization_change_event'),
          to_regclass('event.authorization_projection_checkpoint'),
          to_regclass('event.authorization_snapshot_marker'),
          to_regclass('control.authorization_capture_source')
        ]) AS required(object_id)
        WHERE object_id IS NOT NULL
      ) AS wave0_object_count
  `)).rows[0];
  if (
    !legacyShape
    || legacyShape.v2_column_count !== "0"
    || !legacyShape.legacy_select
    || legacyShape.wave0_object_count !== "6"
  ) {
    throw new Error(
      `Post-rollback legacy/capture shape failed: ${JSON.stringify(legacyShape)}`,
    );
  }

  await client.query("COMMIT");
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "pre_backfill_expand_rolled_back",
    database: identity.database_name,
    approvalTicket: options.approvalTicket,
    rolledBackAt: new Date().toISOString(),
    wave0CapturePreserved: captureAfter,
    restored: "control.entity_operation legacy table SELECT for athyperapp",
    postBackfillPolicy:
      "selector-to-legacy only; retain v2 shadows and evidence",
  }, null, 2)}\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
}

async function readCaptureState(clientToRead: pg.Client): Promise<CaptureState> {
  const state = (await clientToRead.query<CaptureState>(`
    WITH trigger_health AS (
      SELECT count(*) FILTER (
        WHERE relation_id IS NULL
           OR row_trigger_state IS DISTINCT FROM 'A'
           OR truncate_trigger_state IS DISTINCT FROM 'A'
      )::bigint AS invalid_count
      FROM (
        SELECT
          to_regclass(format(
            '%I.%I',
            source.source_schema,
            source.source_table
          )) AS relation_id,
          row_trigger.tgenabled::text AS row_trigger_state,
          truncate_trigger.tgenabled::text AS truncate_trigger_state
        FROM control.authorization_capture_source AS source
        LEFT JOIN pg_trigger AS row_trigger
          ON row_trigger.tgrelid = to_regclass(format(
            '%I.%I',
            source.source_schema,
            source.source_table
          ))
         AND row_trigger.tgname = 'trg_authz_wave0_capture_row'
         AND NOT row_trigger.tgisinternal
        LEFT JOIN pg_trigger AS truncate_trigger
          ON truncate_trigger.tgrelid = to_regclass(format(
            '%I.%I',
            source.source_schema,
            source.source_table
          ))
         AND truncate_trigger.tgname = 'trg_authz_wave0_capture_truncate'
         AND NOT truncate_trigger.tgisinternal
        WHERE source.capture_enabled
      ) AS source_trigger
    )
    SELECT
      clock.source_database_id::text,
      clock.capture_contract_version,
      clock.current_watermark::text,
      (SELECT count(*)::text FROM event.authorization_change_event)
        AS change_event_count,
      (SELECT count(*)::text FROM event.authorization_change_transaction)
        AS transaction_count,
      (SELECT count(*)::text FROM event.authorization_snapshot_marker)
        AS snapshot_marker_count,
      (
        SELECT count(*)::text
        FROM control.authorization_capture_source
        WHERE capture_enabled
      ) AS registered_source_count,
      trigger_health.invalid_count::text AS invalid_capture_trigger_count
    FROM event.authorization_capture_clock AS clock
    CROSS JOIN trigger_health
    WHERE clock.singleton_id = 1
  `)).rows[0];
  if (!state) throw new Error("Wave 0 capture state is absent.");
  return state;
}

function assertCaptureHealthy(state: CaptureState): void {
  if (
    state.invalid_capture_trigger_count !== "0"
    || Number(state.registered_source_count) < 60
    || BigInt(state.current_watermark) !== BigInt(state.change_event_count)
  ) {
    throw new Error(`Wave 0 capture is unhealthy: ${JSON.stringify(state)}`);
  }
}

function parseOptions(args: string[]): Options {
  const result: Options = { apply: false };
  for (const argument of args) {
    if (argument === "--apply") result.apply = true;
    else if (argument === "--help") {
      process.stdout.write(
        "Usage: rollback-authorization-v2-expand.ts "
        + "--apply --expected-database=NAME --approval-ticket=TICKET "
        + `--confirm=${expectedConfirmation}\n`,
      );
      process.exit(0);
    } else if (argument.startsWith("--expected-database=")) {
      result.expectedDatabase = value(argument, "--expected-database=");
    } else if (argument.startsWith("--approval-ticket=")) {
      result.approvalTicket = value(argument, "--approval-ticket=");
    } else if (argument.startsWith("--confirm=")) {
      result.confirmation = value(argument, "--confirm=");
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return result;
}

function value(argument: string, prefix: string): string {
  const parsed = argument.slice(prefix.length).trim();
  if (!parsed) throw new Error(`${prefix.slice(0, -1)} requires a value.`);
  return parsed;
}
