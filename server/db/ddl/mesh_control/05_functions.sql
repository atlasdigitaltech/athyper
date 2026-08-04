-- ============================================================================
-- mesh_control/05_functions.sql
-- Functions and procedures reconstructed from the live catalog; pre-constraint routines are excluded.
-- Generated from the live Mesh database mesh_control schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION mesh_control.authorization_v2_is_effective(p_effective_from timestamp with time zone, p_effective_until timestamp with time zone, p_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
    SELECT
        p_effective_from IS NOT NULL
        AND p_effective_from <= p_at
        AND (p_effective_until IS NULL OR p_at < p_effective_until);
$function$;

CREATE OR REPLACE FUNCTION mesh_control.authorization_v2_owner_aligned(p_catalog_owner_id uuid, p_account_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
    SELECT COALESCE((
        SELECT
            owner_row.account_id IS NOT DISTINCT FROM p_account_id
        FROM mesh_control.auth_catalog_owner owner_row
        WHERE owner_row.id = p_catalog_owner_id
    ), false);
$function$;

COMMENT ON FUNCTION "mesh_control".authorization_v2_owner_aligned(p_catalog_owner_id uuid, p_account_id uuid) IS 'True only when a catalog row carries the exact platform/account ownership of its local catalog owner.';

CREATE OR REPLACE FUNCTION mesh_control.authorization_v2_window_contains(p_parent_from timestamp with time zone, p_parent_until timestamp with time zone, p_child_from timestamp with time zone, p_child_until timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
    SELECT
        p_parent_from IS NOT NULL
        AND p_child_from IS NOT NULL
        AND p_parent_from <= p_child_from
        AND (
            p_parent_until IS NULL
            OR (
                p_child_until IS NOT NULL
                AND p_child_until <= p_parent_until
            )
        );
$function$;

CREATE OR REPLACE FUNCTION mesh_control.fn_authorization_freeze_legacy_writes_v2(p_expected_source_database_id uuid, p_expected_revision text, p_approval_ticket text, p_approved_by text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'mesh_control', 'mesh_log'
AS $function$
DECLARE
    v_readiness record;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('athyper:authorization-cutover:mesh', 0)
    );
    SELECT * INTO v_readiness
    FROM mesh_log.v_authorization_wave7_readiness_v2;
    IF NOT FOUND
       OR v_readiness.source_database_id <> p_expected_source_database_id
       OR v_readiness.policy_revision <> p_expected_revision
       OR v_readiness.writer_authority <> 'legacy'
       OR NOT v_readiness.ready_for_read_enforce THEN
        RAISE EXCEPTION 'Mesh legacy writer freeze gates are not satisfied';
    END IF;
    PERFORM set_config('app.authorization_cutover_transition', 'on', true);
    UPDATE mesh_control.authorization_cutover_plane_v2
       SET legacy_write_frozen = true,
           legacy_write_frozen_at = statement_timestamp(),
           freeze_source_watermark = v_readiness.source_watermark,
           freeze_applied_watermark = v_readiness.applied_watermark,
           approval_ticket = p_approval_ticket,
           approved_by = p_approved_by,
           approved_at = statement_timestamp(),
           updated_at = statement_timestamp(),
           updated_by = session_user
     WHERE plane_code = 'mesh';
    RETURN v_readiness.source_watermark;
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.fn_authorization_install_legacy_freeze_guards_v2()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'mesh_control'
AS $function$
DECLARE
    v_source record;
    v_relation regclass;
    v_count integer := 0;
BEGIN
    FOR v_source IN
        SELECT source_schema, source_table
        FROM mesh_control.authorization_capture_source
        WHERE capture_enabled
        ORDER BY source_schema, source_table
    LOOP
        v_relation := to_regclass(format(
            '%I.%I', v_source.source_schema, v_source.source_table
        ));
        IF v_relation IS NULL THEN
            RAISE EXCEPTION 'missing Mesh legacy freeze target %.%',
                v_source.source_schema, v_source.source_table;
        END IF;
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_authorization_legacy_freeze_v2 ON %s',
            v_relation
        );
        EXECUTE format(
            'CREATE TRIGGER trg_authorization_legacy_freeze_v2 '
            'BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW '
            'EXECUTE FUNCTION '
            'mesh_control.trg_authorization_legacy_write_freeze_v2()',
            v_relation
        );
        EXECUTE format(
            'ALTER TABLE %s ENABLE ALWAYS TRIGGER '
            'trg_authorization_legacy_freeze_v2',
            v_relation
        );
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_authorization_legacy_freeze_truncate_v2 '
            'ON %s',
            v_relation
        );
        EXECUTE format(
            'CREATE TRIGGER trg_authorization_legacy_freeze_truncate_v2 '
            'BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION '
            'mesh_control.trg_authorization_legacy_write_freeze_v2()',
            v_relation
        );
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.fn_authorization_install_target_guard_v2(p_target_relation regclass, p_approval_ticket text, p_approved_by text, p_definition_sha256 text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'mesh_control'
AS $function$
DECLARE
    v_schema text;
BEGIN
    SELECT namespace.nspname INTO v_schema
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE relation.oid = p_target_relation;
    IF v_schema NOT IN ('mesh', 'mesh_control')
       OR p_definition_sha256 !~ '^[0-9a-f]{64}$'
       OR btrim(COALESCE(p_approval_ticket, '')) = ''
       OR btrim(COALESCE(p_approved_by, '')) = '' THEN
        RAISE EXCEPTION 'invalid Mesh target guard approval';
    END IF;
    EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_authorization_target_writer_v2 ON %s',
        p_target_relation
    );
    EXECUTE format(
        'CREATE TRIGGER trg_authorization_target_writer_v2 '
        'BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW '
        'EXECUTE FUNCTION mesh_control.trg_authorization_target_writer_v2()',
        p_target_relation
    );
    EXECUTE format(
        'ALTER TABLE %s ENABLE ALWAYS TRIGGER '
        'trg_authorization_target_writer_v2',
        p_target_relation
    );
    EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_authorization_target_writer_truncate_v2 '
        'ON %s',
        p_target_relation
    );
    EXECUTE format(
        'ALTER TABLE %s ENABLE ALWAYS TRIGGER '
        'trg_authorization_target_writer_truncate_v2',
        p_target_relation
    );
    EXECUTE format(
        'CREATE TRIGGER trg_authorization_target_writer_truncate_v2 '
        'BEFORE TRUNCATE ON %s FOR EACH STATEMENT '
        'EXECUTE FUNCTION mesh_control.trg_authorization_target_writer_v2()',
        p_target_relation
    );
    INSERT INTO mesh_control.authorization_target_guard_installation_v2 (
        target_relation, status, approval_ticket,
        approved_by, definition_sha256
    ) VALUES (
        p_target_relation, 'installed', p_approval_ticket,
        p_approved_by, p_definition_sha256
    )
    ON CONFLICT (target_relation) DO UPDATE
       SET status = 'installed',
           approval_ticket = EXCLUDED.approval_ticket,
           approved_by = EXCLUDED.approved_by,
           installed_at = statement_timestamp(),
           installed_by = session_user,
           definition_sha256 = EXCLUDED.definition_sha256,
           validation_ticket = NULL,
           validated_at = NULL,
           validated_by = NULL;
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.fn_authorization_set_cohort_state_v2(p_cohort_code text, p_requested_state text, p_expected_source_database_id uuid, p_transition_ticket text, p_transition_by text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'mesh_control', 'mesh_log'
AS $function$
DECLARE
    v_cutover mesh_control.authorization_cutover_plane_v2%ROWTYPE;
    v_cohort mesh_control.authorization_cutover_cohort_v2%ROWTYPE;
    v_readiness record;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('athyper:authorization-cutover:mesh', 0)
    );
    IF p_requested_state NOT IN (
        'shadow', 'enforce', 'rolled_back', 'retired'
    )
       OR btrim(COALESCE(p_transition_ticket, '')) = ''
       OR btrim(COALESCE(p_transition_by, '')) = '' THEN
        RAISE EXCEPTION 'Mesh cohort transition approval is incomplete';
    END IF;
    SELECT * INTO v_cutover
    FROM mesh_control.authorization_cutover_plane_v2
    WHERE plane_code = 'mesh'
    FOR UPDATE;
    SELECT * INTO v_cohort
    FROM mesh_control.authorization_cutover_cohort_v2
    WHERE cohort_code = p_cohort_code
    FOR UPDATE;
    SELECT * INTO v_readiness
    FROM mesh_log.v_authorization_wave7_readiness_v2
    WHERE plane_code = 'mesh';
    IF NOT FOUND
       OR v_cutover.plane_code IS NULL
       OR v_cohort.id IS NULL
       OR v_readiness.source_database_id <> p_expected_source_database_id
       OR v_cohort.source_database_id <> p_expected_source_database_id THEN
        RAISE EXCEPTION 'Mesh cohort source identity/readiness mismatch';
    END IF;
    IF p_requested_state = 'enforce'
       AND (
           NOT v_readiness.ready_for_read_enforce
           OR v_readiness.applied_watermark
                < v_cohort.minimum_applied_watermark
           OR statement_timestamp() < v_cohort.effective_from
           OR v_cohort.active_user_parity_sha256 IS NULL
       ) THEN
        RAISE EXCEPTION 'Mesh cohort enforcement gates are not satisfied';
    END IF;
    IF p_requested_state IN ('shadow', 'rolled_back')
       AND v_cutover.writer_authority = 'target'
       AND NOT (
           v_cutover.instant_rollback_promised
           AND v_cutover.reverse_projector_status = 'active'
       ) THEN
        RAISE EXCEPTION 'Mesh cohort rollback is no longer promised';
    END IF;
    PERFORM set_config('app.authorization_cutover_transition', 'on', true);
    UPDATE mesh_control.authorization_cutover_cohort_v2
       SET state = p_requested_state,
           last_transition_ticket = p_transition_ticket,
           last_transition_at = statement_timestamp(),
           last_transition_by = p_transition_by,
           retired_at = CASE WHEN p_requested_state = 'retired'
               THEN statement_timestamp() ELSE NULL END,
           retired_by = CASE WHEN p_requested_state = 'retired'
               THEN p_transition_by ELSE NULL END
     WHERE id = v_cohort.id;
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.fn_authorization_set_resolver_state_v2(p_requested_state text, p_expected_revision text, p_new_revision text, p_approval_ticket text, p_approved_by text, p_rollback_owner text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'mesh_control', 'mesh_log'
AS $function$
DECLARE
    v_cutover mesh_control.authorization_cutover_plane_v2%ROWTYPE;
    v_readiness record;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('athyper:authorization-cutover:mesh', 0)
    );
    IF p_requested_state NOT IN (
        'legacy', 'shadow', 'cohort_enforce', 'all_enforce',
        'observation_complete'
    ) THEN
        RAISE EXCEPTION 'unsupported Mesh resolver transition';
    END IF;
    SELECT * INTO v_cutover
    FROM mesh_control.authorization_cutover_plane_v2
    WHERE plane_code = 'mesh'
    FOR UPDATE;
    IF NOT FOUND OR v_cutover.policy_revision <> p_expected_revision THEN
        RAISE EXCEPTION 'Mesh cutover policy revision mismatch';
    END IF;
    SELECT * INTO v_readiness
    FROM mesh_log.v_authorization_wave7_readiness_v2;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mesh Wave 7 readiness evidence is unavailable';
    END IF;
    IF p_requested_state IN ('legacy', 'shadow', 'cohort_enforce')
       AND v_cutover.writer_authority = 'target'
       AND NOT (
           v_cutover.instant_rollback_promised
           AND v_cutover.reverse_projector_status = 'active'
       ) THEN
        RAISE EXCEPTION
            'post-writer-switch Mesh resolver rollback is unavailable';
    ELSIF p_requested_state = 'shadow'
       AND NOT v_readiness.ready_for_shadow_compare THEN
        RAISE EXCEPTION 'Mesh shadow projection is not ready';
    ELSIF p_requested_state IN ('cohort_enforce', 'all_enforce')
       AND NOT v_readiness.ready_for_read_enforce THEN
        RAISE EXCEPTION 'Mesh read enforcement gates are not satisfied';
    ELSIF p_requested_state = 'observation_complete'
       AND (
           v_cutover.writer_authority <> 'target'
           OR NOT v_readiness.observation_window_complete
       ) THEN
        RAISE EXCEPTION 'Mesh observation window is incomplete';
    END IF;
    IF btrim(COALESCE(p_new_revision, '')) = ''
       OR btrim(COALESCE(p_approval_ticket, '')) = ''
       OR btrim(COALESCE(p_approved_by, '')) = ''
       OR btrim(COALESCE(p_rollback_owner, '')) = '' THEN
        RAISE EXCEPTION 'Mesh resolver approval is incomplete';
    END IF;

    PERFORM set_config('app.authorization_cutover_transition', 'on', true);
    UPDATE mesh_control.authorization_cutover_plane_v2
       SET resolver_state = p_requested_state,
           policy_revision = p_new_revision,
           source_database_id = v_readiness.source_database_id,
           approval_ticket = p_approval_ticket,
           approved_by = p_approved_by,
           approved_at = statement_timestamp(),
           rollback_owner = p_rollback_owner,
           observation_completed_at = CASE
               WHEN p_requested_state = 'observation_complete'
               THEN statement_timestamp()
               ELSE observation_completed_at
           END,
           observation_window_ends_at = CASE
               WHEN p_requested_state = 'all_enforce'
               THEN (
                   SELECT max(cohort.observation_window_ends_at)
                   FROM mesh_control.authorization_cutover_cohort_v2 AS cohort
                   WHERE cohort.state IN ('shadow', 'enforce')
               )
               ELSE observation_window_ends_at
           END,
           updated_at = statement_timestamp(),
           updated_by = session_user
     WHERE plane_code = 'mesh';
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.fn_authorization_switch_writer_v2(p_expected_source_database_id uuid, p_expected_source_watermark bigint, p_expected_revision text, p_legacy_writer_key text, p_target_writer_key text, p_instant_rollback_promised boolean, p_reverse_projector_status text, p_reverse_projector_evidence_sha256 text, p_gate_evidence_sha256 text, p_approval_ticket text, p_approved_by text, p_rollback_owner text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'mesh_control', 'mesh_log'
AS $function$
DECLARE
    v_cutover mesh_control.authorization_cutover_plane_v2%ROWTYPE;
    v_readiness record;
    v_next_epoch bigint;
    v_guard_count bigint;
    v_approved_writer_keys bigint;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('athyper:authorization-cutover:mesh', 0)
    );
    SELECT * INTO v_cutover
    FROM mesh_control.authorization_cutover_plane_v2
    WHERE plane_code = 'mesh'
    FOR UPDATE;
    SELECT * INTO v_readiness
    FROM mesh_log.v_authorization_wave7_readiness_v2;
    IF NOT FOUND
       OR v_cutover.plane_code IS NULL
       OR v_readiness.source_database_id <> p_expected_source_database_id
       OR v_readiness.source_watermark <> p_expected_source_watermark
       OR v_readiness.applied_watermark <> p_expected_source_watermark
       OR v_readiness.policy_revision <> p_expected_revision
       OR NOT v_readiness.ready_for_writer_switch THEN
        RAISE EXCEPTION
            'Mesh writer switch requires frozen zero-lag reconciled authority';
    END IF;
    IF p_instant_rollback_promised
       AND (
           p_reverse_projector_status NOT IN ('tested', 'active')
           OR p_reverse_projector_evidence_sha256 !~ '^[0-9a-f]{64}$'
       ) THEN
        RAISE EXCEPTION
            'Mesh instant rollback requires tested reverse projection';
    END IF;
    IF p_gate_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Mesh writer switch evidence hash is invalid';
    END IF;
    SELECT count(*) INTO v_guard_count
    FROM mesh_control.authorization_target_guard_installation_v2
    WHERE status = 'validated';
    IF v_guard_count = 0 THEN
        RAISE EXCEPTION 'no validated Mesh target write guard is installed';
    END IF;
    SELECT count(*) INTO v_approved_writer_keys
    FROM mesh_control.authorization_writer_registry AS writer
    WHERE writer.writer_key IN (p_legacy_writer_key, p_target_writer_key)
      AND writer.status = 'approved'
      AND statement_timestamp() >= writer.effective_from
      AND (
          writer.effective_until IS NULL
          OR statement_timestamp() < writer.effective_until
      )
      AND (
          writer.writer_key <> p_target_writer_key
          OR writer.write_path = 'canonical_api'
      );
    IF p_legacy_writer_key = p_target_writer_key
       OR v_approved_writer_keys <> 2 THEN
        RAISE EXCEPTION
            'Mesh writer keys are not distinct approved registry entries';
    END IF;

    v_next_epoch := v_cutover.writer_epoch + 1;
    PERFORM set_config('app.authorization_cutover_transition', 'on', true);
    UPDATE mesh_control.authorization_cutover_plane_v2
       SET writer_authority = 'target',
           writer_epoch = v_next_epoch,
           freeze_source_watermark = p_expected_source_watermark,
           freeze_applied_watermark = p_expected_source_watermark,
           instant_rollback_promised = p_instant_rollback_promised,
           reverse_projector_status = p_reverse_projector_status,
           reverse_projector_evidence_sha256 =
               p_reverse_projector_evidence_sha256,
           approval_ticket = p_approval_ticket,
           approved_by = p_approved_by,
           approved_at = statement_timestamp(),
           rollback_owner = p_rollback_owner,
           updated_at = statement_timestamp(),
           updated_by = session_user
     WHERE plane_code = 'mesh';
    INSERT INTO mesh_control.authorization_writer_switch_receipt_v2 (
        writer_epoch, source_database_id, source_watermark, applied_watermark,
        freeze_started_at, legacy_writer_key, target_writer_key,
        instant_rollback_promised, reverse_projector_status,
        reverse_projector_evidence_sha256, gate_evidence_sha256,
        approval_ticket, approved_by, rollback_owner
    ) VALUES (
        v_next_epoch, p_expected_source_database_id,
        p_expected_source_watermark, p_expected_source_watermark,
        v_cutover.legacy_write_frozen_at,
        p_legacy_writer_key, p_target_writer_key,
        p_instant_rollback_promised, p_reverse_projector_status,
        p_reverse_projector_evidence_sha256, p_gate_evidence_sha256,
        p_approval_ticket, p_approved_by, p_rollback_owner
    );
    RETURN v_next_epoch;
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.fn_authorization_validate_target_guard_v2(p_target_relation regclass, p_expected_definition_sha256 text, p_validation_ticket text, p_validated_by text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'mesh_control'
AS $function$
DECLARE
    v_guard_count integer;
BEGIN
    IF p_expected_definition_sha256 !~ '^[0-9a-f]{64}$'
       OR btrim(COALESCE(p_validation_ticket, '')) = ''
       OR btrim(COALESCE(p_validated_by, '')) = '' THEN
        RAISE EXCEPTION 'Mesh target guard validation evidence is incomplete';
    END IF;
    SELECT count(*) INTO v_guard_count
    FROM pg_trigger
    WHERE tgrelid = p_target_relation
      AND tgname IN (
          'trg_authorization_target_writer_v2',
          'trg_authorization_target_writer_truncate_v2'
      )
      AND tgenabled = 'A'
      AND NOT tgisinternal;
    IF v_guard_count <> 2 THEN
        RAISE EXCEPTION 'Mesh target relation lacks both ALWAYS guards';
    END IF;
    UPDATE mesh_control.authorization_target_guard_installation_v2
       SET status = 'validated',
           validation_ticket = p_validation_ticket,
           validated_at = statement_timestamp(),
           validated_by = p_validated_by
     WHERE target_relation = p_target_relation
       AND status = 'installed'
       AND definition_sha256 = p_expected_definition_sha256;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mesh target guard installation/hash mismatch';
    END IF;
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_cohort_guard_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
    v_permission text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Mesh authorization cohorts are retired, not deleted';
    END IF;
    FOREACH v_permission IN ARRAY NEW.permission_codes LOOP
        IF btrim(v_permission) = ''
           OR position('*' IN v_permission) > 0
           OR position('%' IN v_permission) > 0 THEN
            RAISE EXCEPTION
                'Mesh authorization cohort permissions must be exact';
        END IF;
    END LOOP;
    IF TG_OP = 'UPDATE'
       AND NEW.state IS DISTINCT FROM OLD.state
       AND current_setting('app.authorization_cutover_transition', true)
            IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Mesh authorization cohort state is function-managed';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_cutover_state_guard_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
    IF current_setting('app.authorization_cutover_transition', true)
       IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Mesh authorization cutover state is function-managed';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Mesh authorization cutover state cannot be deleted';
    END IF;
    IF NEW.writer_epoch < OLD.writer_epoch THEN
        RAISE EXCEPTION 'Mesh authorization writer epoch cannot decrease';
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_legacy_write_freeze_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'mesh_control'
AS $function$
DECLARE
    v_cutover mesh_control.authorization_cutover_plane_v2%ROWTYPE;
BEGIN
    SELECT * INTO v_cutover
    FROM mesh_control.authorization_cutover_plane_v2
    WHERE plane_code = 'mesh';
    IF NOT v_cutover.legacy_write_frozen THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        IF TG_LEVEL = 'STATEMENT' THEN RETURN NULL; END IF;
        RETURN NEW;
    END IF;
    IF v_cutover.writer_authority = 'target'
       AND v_cutover.reverse_projector_status = 'active'
       AND current_setting('app.authorization_writer_path', true)
            = 'target_to_legacy_projector' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        IF TG_LEVEL = 'STATEMENT' THEN RETURN NULL; END IF;
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Mesh legacy authorization writes are frozen';
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_target_writer_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'mesh_control'
AS $function$
DECLARE
    v_expected_path text;
    v_writer_key text;
    v_operation text;
    v_writer_count integer;
BEGIN
    SELECT CASE writer_authority
        WHEN 'target' THEN 'canonical_api'
        ELSE 'legacy_projector'
    END INTO v_expected_path
    FROM mesh_control.authorization_cutover_plane_v2
    WHERE plane_code = 'mesh';
    v_writer_key := current_setting('app.authorization_writer_key', true);
    v_operation := CASE TG_OP
        WHEN 'INSERT' THEN 'I'
        WHEN 'UPDATE' THEN 'U'
        WHEN 'DELETE' THEN 'D'
        WHEN 'TRUNCATE' THEN 'T'
    END;
    SELECT count(*) INTO v_writer_count
    FROM mesh_control.authorization_writer_registry AS writer
    WHERE writer.writer_key = v_writer_key
      AND writer.status = 'approved'
      AND statement_timestamp() >= writer.effective_from
      AND (
          writer.effective_until IS NULL
          OR statement_timestamp() < writer.effective_until
      )
      AND session_user LIKE writer.db_role_pattern
      AND current_setting('application_name', true)
            LIKE writer.application_name_pattern
      AND TG_TABLE_SCHEMA LIKE writer.source_schema_pattern
      AND TG_TABLE_NAME LIKE writer.source_table_pattern
      AND v_operation = ANY(writer.allowed_operations)
      AND writer.write_path = v_expected_path;
    IF v_writer_count <> 1 THEN
        RAISE EXCEPTION
            'direct Mesh target authorization write rejected';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_LEVEL = 'STATEMENT' THEN RETURN NULL; END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v2_guard_entity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
BEGIN
    IF NOT mesh_control.authorization_v2_owner_aligned(
        NEW.catalog_owner_id,
        NEW.account_id
    ) THEN
        RAISE EXCEPTION
            'Mesh entity % rejected: catalog owner/account mismatch',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> 'published' THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM mesh_control.auth_catalog_owner owner_row
        WHERE owner_row.id = NEW.catalog_owner_id
          AND owner_row.account_id IS NOT DISTINCT FROM NEW.account_id
          AND owner_row.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'Mesh entity % cannot publish: catalog owner is not active',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v2_guard_entity_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
DECLARE
    v_now           timestamptz := statement_timestamp();
    v_entity_from   timestamptz;
    v_entity_until  timestamptz;
BEGIN
    IF NOT mesh_control.authorization_v2_owner_aligned(
        NEW.catalog_owner_id,
        NEW.account_id
    ) THEN
        RAISE EXCEPTION
            'Mesh entity version % rejected: catalog owner/account mismatch',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> 'published' THEN
        RETURN NEW;
    END IF;

    SELECT
        entity_row.effective_from,
        entity_row.effective_until
    INTO
        v_entity_from,
        v_entity_until
    FROM mesh_control.entity entity_row
    JOIN mesh_control.auth_catalog_owner owner_row
      ON owner_row.id = entity_row.catalog_owner_id
     AND owner_row.account_id IS NOT DISTINCT FROM entity_row.account_id
     AND owner_row.status = 'active'
    WHERE entity_row.id = NEW.entity_id
      AND entity_row.catalog_owner_id = NEW.catalog_owner_id
      AND entity_row.account_scope_key
          = COALESCE(NEW.account_id, NEW.catalog_owner_id)
      AND entity_row.status = 'published'
      AND mesh_control.authorization_v2_is_effective(
          entity_row.effective_from,
          entity_row.effective_until,
          v_now
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Mesh entity version % cannot publish without an active exact entity',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NOT mesh_control.authorization_v2_window_contains(
        v_entity_from,
        v_entity_until,
        NEW.effective_from,
        NEW.effective_until
    ) THEN
        RAISE EXCEPTION
            'Mesh entity version % cannot publish outside the entity effective window',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v2_guard_operation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
DECLARE
    v_now                   timestamptz := statement_timestamp();
    v_entity_from           timestamptz;
    v_entity_until          timestamptz;
    v_version_from          timestamptz;
    v_version_until         timestamptz;
    v_permission_from       timestamptz;
    v_permission_until      timestamptz;
    v_permission_risk       text;
    v_permission_mfa        boolean;
    v_permission_sod        boolean;
    v_permission_shareable  boolean;
    v_permission_delegable  boolean;
BEGIN
    IF NOT mesh_control.authorization_v2_owner_aligned(
        NEW.catalog_owner_id,
        NEW.account_id
    ) THEN
        RAISE EXCEPTION
            'Mesh operation % rejected: catalog owner/account mismatch',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> 'published' THEN
        RETURN NEW;
    END IF;

    SELECT
        entity_row.effective_from,
        entity_row.effective_until,
        version_row.effective_from,
        version_row.effective_until,
        permission_row.effective_from,
        permission_row.effective_until,
        permission_row.risk_tier,
        permission_row.requires_mfa,
        permission_row.requires_sod,
        permission_row.is_shareable,
        permission_row.is_delegable
    INTO
        v_entity_from,
        v_entity_until,
        v_version_from,
        v_version_until,
        v_permission_from,
        v_permission_until,
        v_permission_risk,
        v_permission_mfa,
        v_permission_sod,
        v_permission_shareable,
        v_permission_delegable
    FROM mesh_control.entity entity_row
    JOIN mesh_control.auth_catalog_owner owner_row
      ON owner_row.id = entity_row.catalog_owner_id
     AND owner_row.account_id IS NOT DISTINCT FROM entity_row.account_id
     AND owner_row.status = 'active'
    JOIN mesh_control.auth_permission permission_row
      ON permission_row.id = NEW.permission_id
     AND permission_row.catalog_owner_id = NEW.catalog_owner_id
     AND permission_row.account_scope_key
         = COALESCE(NEW.account_id, NEW.catalog_owner_id)
     AND permission_row.entity_id = NEW.entity_id
     AND permission_row.operation_code = NEW.operation_code
     AND permission_row.status = 'published'
    LEFT JOIN mesh_control.entity_version version_row
      ON version_row.id = NEW.entity_version_id
     AND version_row.catalog_owner_id = NEW.catalog_owner_id
     AND version_row.account_scope_key
         = COALESCE(NEW.account_id, NEW.catalog_owner_id)
     AND version_row.entity_id = NEW.entity_id
    WHERE entity_row.id = NEW.entity_id
      AND entity_row.catalog_owner_id = NEW.catalog_owner_id
      AND entity_row.account_scope_key
          = COALESCE(NEW.account_id, NEW.catalog_owner_id)
      AND entity_row.status = 'published'
      AND (
          NEW.entity_version_id IS NULL
          OR (
              version_row.id IS NOT NULL
              AND version_row.status = 'published'
              AND mesh_control.authorization_v2_is_effective(
                  version_row.effective_from,
                  version_row.effective_until,
                  v_now
              )
          )
      )
      AND mesh_control.authorization_v2_is_effective(
          entity_row.effective_from,
          entity_row.effective_until,
          v_now
      )
      AND mesh_control.authorization_v2_is_effective(
          permission_row.effective_from,
          permission_row.effective_until,
          v_now
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Mesh operation % cannot publish without one exact active entity and permission',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NOT mesh_control.authorization_v2_window_contains(
        v_entity_from,
        v_entity_until,
        NEW.effective_from,
        NEW.effective_until
    ) OR NOT mesh_control.authorization_v2_window_contains(
        v_permission_from,
        v_permission_until,
        NEW.effective_from,
        NEW.effective_until
    ) OR (
        NEW.entity_version_id IS NOT NULL
        AND NOT mesh_control.authorization_v2_window_contains(
            v_version_from,
            v_version_until,
            NEW.effective_from,
            NEW.effective_until
        )
    ) THEN
        RAISE EXCEPTION
            'Mesh operation % cannot exceed parent catalog effective windows',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.risk_tier IS DISTINCT FROM v_permission_risk
       OR NEW.requires_mfa IS DISTINCT FROM v_permission_mfa
       OR NEW.requires_sod IS DISTINCT FROM v_permission_sod
       OR NEW.is_shareable IS DISTINCT FROM v_permission_shareable
       OR NEW.is_delegable IS DISTINCT FROM v_permission_delegable
    THEN
        RAISE EXCEPTION
            'Mesh operation % cannot publish: permission security metadata mismatch',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v2_guard_operation_plane()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
DECLARE
    v_now               timestamptz := statement_timestamp();
    v_operation_from    timestamptz;
    v_operation_until   timestamptz;
    v_permission_from   timestamptz;
    v_permission_until  timestamptz;
    v_plane_from        timestamptz;
    v_plane_until       timestamptz;
BEGIN
    IF NEW.status <> 'published' THEN
        RETURN NEW;
    END IF;

    SELECT
        operation_row.effective_from,
        operation_row.effective_until,
        permission_row.effective_from,
        permission_row.effective_until,
        permission_plane.effective_from,
        permission_plane.effective_until
    INTO
        v_operation_from,
        v_operation_until,
        v_permission_from,
        v_permission_until,
        v_plane_from,
        v_plane_until
    FROM mesh_control.entity_operation operation_row
    JOIN mesh_control.auth_permission permission_row
      ON permission_row.id = operation_row.permission_id
     AND permission_row.catalog_owner_id = operation_row.catalog_owner_id
     AND permission_row.account_scope_key = operation_row.account_scope_key
     AND permission_row.entity_id = operation_row.entity_id
     AND permission_row.operation_code = operation_row.operation_code
     AND permission_row.status = 'published'
    JOIN mesh_control.auth_catalog_owner owner_row
      ON owner_row.id = operation_row.catalog_owner_id
     AND owner_row.account_id IS NOT DISTINCT FROM operation_row.account_id
     AND owner_row.status = 'active'
    JOIN mesh_control.auth_permission_plane permission_plane
      ON permission_plane.permission_id = permission_row.id
     AND permission_plane.plane_code = NEW.plane_code
     AND permission_plane.status = 'active'
    JOIN mesh_control.auth_plane plane_row
      ON plane_row.plane_code = permission_plane.plane_code
     AND plane_row.status = 'active'
    WHERE operation_row.id = NEW.entity_operation_id
      AND operation_row.permission_id = NEW.permission_id
      AND operation_row.status = 'published'
      AND mesh_control.authorization_v2_is_effective(
          operation_row.effective_from,
          operation_row.effective_until,
          v_now
      )
      AND mesh_control.authorization_v2_is_effective(
          permission_row.effective_from,
          permission_row.effective_until,
          v_now
      )
      AND mesh_control.authorization_v2_is_effective(
          permission_plane.effective_from,
          permission_plane.effective_until,
          v_now
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Mesh operation-plane %/% cannot publish without an exact active operation and permission-plane',
            NEW.entity_operation_id,
            NEW.plane_code
            USING ERRCODE = '23514';
    END IF;

    IF NOT mesh_control.authorization_v2_window_contains(
        v_operation_from,
        v_operation_until,
        NEW.effective_from,
        NEW.effective_until
    ) OR NOT mesh_control.authorization_v2_window_contains(
        v_permission_from,
        v_permission_until,
        NEW.effective_from,
        NEW.effective_until
    ) OR NOT mesh_control.authorization_v2_window_contains(
        v_plane_from,
        v_plane_until,
        NEW.effective_from,
        NEW.effective_until
    ) THEN
        RAISE EXCEPTION
            'Mesh operation-plane %/% cannot exceed parent effective windows',
            NEW.entity_operation_id,
            NEW.plane_code
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v2_guard_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
DECLARE
    v_now timestamptz := statement_timestamp();
BEGIN
    IF NOT mesh_control.authorization_v2_owner_aligned(
        NEW.catalog_owner_id,
        NEW.account_id
    ) THEN
        RAISE EXCEPTION
            'Mesh permission % rejected: catalog owner/account mismatch',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> 'published' THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM mesh_control.auth_catalog_owner owner_row
        WHERE owner_row.id = NEW.catalog_owner_id
          AND owner_row.account_id IS NOT DISTINCT FROM NEW.account_id
          AND owner_row.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'Mesh permission % cannot publish: catalog owner is not active',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM mesh_control.auth_permission_category category_row
        WHERE category_row.id = NEW.category_id
          AND category_row.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'Mesh permission % cannot publish: category is not active',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.entity_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM mesh_control.entity entity_row
           WHERE entity_row.id = NEW.entity_id
             AND entity_row.catalog_owner_id = NEW.catalog_owner_id
             AND entity_row.account_scope_key
                 = COALESCE(NEW.account_id, NEW.catalog_owner_id)
             AND entity_row.status = 'published'
             AND mesh_control.authorization_v2_is_effective(
                 entity_row.effective_from,
                 entity_row.effective_until,
                 v_now
             )
       )
    THEN
        RAISE EXCEPTION
            'Mesh permission % cannot publish without an active exact entity',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v2_guard_permission_plane()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
DECLARE
    v_now               timestamptz := statement_timestamp();
    v_permission_from   timestamptz;
    v_permission_until  timestamptz;
BEGIN
    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;

    SELECT
        permission_row.effective_from,
        permission_row.effective_until
    INTO
        v_permission_from,
        v_permission_until
    FROM mesh_control.auth_permission permission_row
    JOIN mesh_control.auth_catalog_owner owner_row
      ON owner_row.id = permission_row.catalog_owner_id
     AND owner_row.account_id IS NOT DISTINCT FROM permission_row.account_id
     AND owner_row.status = 'active'
    JOIN mesh_control.auth_plane plane_row
      ON plane_row.plane_code = NEW.plane_code
     AND plane_row.status = 'active'
    WHERE permission_row.id = NEW.permission_id
      AND permission_row.status = 'published'
      AND mesh_control.authorization_v2_is_effective(
          permission_row.effective_from,
          permission_row.effective_until,
          v_now
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Mesh permission-plane %/% cannot activate without an active permission and plane',
            NEW.permission_id,
            NEW.plane_code
            USING ERRCODE = '23514';
    END IF;

    IF NOT mesh_control.authorization_v2_window_contains(
        v_permission_from,
        v_permission_until,
        NEW.effective_from,
        NEW.effective_until
    ) THEN
        RAISE EXCEPTION
            'Mesh permission-plane %/% cannot exceed the permission effective window',
            NEW.permission_id,
            NEW.plane_code
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v2_guard_scope_binding()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
DECLARE
    v_now              timestamptz := statement_timestamp();
    v_operation_from   timestamptz;
    v_operation_until  timestamptz;
    v_policy_from      timestamptz;
    v_policy_until     timestamptz;
BEGIN
    IF NOT mesh_control.authorization_v2_owner_aligned(
        NEW.catalog_owner_id,
        NEW.account_id
    ) THEN
        RAISE EXCEPTION
            'Mesh scope binding % rejected: catalog owner/account mismatch',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> 'published' THEN
        RETURN NEW;
    END IF;

    SELECT
        operation_plane.effective_from,
        operation_plane.effective_until,
        scope_policy.effective_from,
        scope_policy.effective_until
    INTO
        v_operation_from,
        v_operation_until,
        v_policy_from,
        v_policy_until
    FROM mesh_control.entity_operation_plane operation_plane
    JOIN mesh_control.entity_operation operation_row
      ON operation_row.id = operation_plane.entity_operation_id
     AND operation_row.permission_id = operation_plane.permission_id
     AND operation_row.catalog_owner_id = NEW.catalog_owner_id
     AND operation_row.account_scope_key
         = COALESCE(NEW.account_id, NEW.catalog_owner_id)
     AND operation_row.entity_id = NEW.entity_id
     AND operation_row.status = 'published'
    JOIN mesh_control.auth_permission permission_row
      ON permission_row.id = operation_plane.permission_id
     AND permission_row.catalog_owner_id = operation_row.catalog_owner_id
     AND permission_row.account_scope_key = operation_row.account_scope_key
     AND permission_row.entity_id = operation_row.entity_id
     AND permission_row.operation_code = operation_row.operation_code
     AND permission_row.status = 'published'
    JOIN mesh_control.auth_catalog_owner owner_row
      ON owner_row.id = operation_row.catalog_owner_id
     AND owner_row.account_id IS NOT DISTINCT FROM operation_row.account_id
     AND owner_row.status = 'active'
    JOIN mesh_control.auth_permission_plane permission_plane
      ON permission_plane.permission_id = operation_plane.permission_id
     AND permission_plane.plane_code = operation_plane.plane_code
     AND permission_plane.status = 'active'
    JOIN mesh_control.auth_plane plane_row
      ON plane_row.plane_code = operation_plane.plane_code
     AND plane_row.status = 'active'
    JOIN mesh_control.auth_permission_scope_policy scope_policy
      ON scope_policy.id = NEW.scope_policy_id
     AND scope_policy.permission_id = operation_plane.permission_id
     AND scope_policy.plane_code = operation_plane.plane_code
     AND scope_policy.scope_kind = NEW.scope_kind
     AND scope_policy.status = 'published'
    WHERE operation_plane.entity_operation_id = NEW.entity_operation_id
      AND operation_plane.permission_id = NEW.permission_id
      AND operation_plane.plane_code = NEW.plane_code
      AND operation_plane.status = 'published'
      AND mesh_control.authorization_v2_is_effective(
          operation_plane.effective_from,
          operation_plane.effective_until,
          v_now
      )
      AND mesh_control.authorization_v2_is_effective(
          operation_row.effective_from,
          operation_row.effective_until,
          v_now
      )
      AND mesh_control.authorization_v2_is_effective(
          permission_row.effective_from,
          permission_row.effective_until,
          v_now
      )
      AND mesh_control.authorization_v2_is_effective(
          permission_plane.effective_from,
          permission_plane.effective_until,
          v_now
      )
      AND mesh_control.authorization_v2_is_effective(
          scope_policy.effective_from,
          scope_policy.effective_until,
          v_now
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Mesh scope binding % cannot publish without an exact active operation-plane and policy',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NOT mesh_control.authorization_v2_window_contains(
        v_operation_from,
        v_operation_until,
        NEW.effective_from,
        NEW.effective_until
    ) OR NOT mesh_control.authorization_v2_window_contains(
        v_policy_from,
        v_policy_until,
        NEW.effective_from,
        NEW.effective_until
    ) THEN
        RAISE EXCEPTION
            'Mesh scope binding % cannot exceed parent effective windows',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v2_guard_scope_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
DECLARE
    v_now               timestamptz := statement_timestamp();
    v_permission_from   timestamptz;
    v_permission_until  timestamptz;
    v_plane_from        timestamptz;
    v_plane_until       timestamptz;
BEGIN
    IF NEW.status <> 'published' THEN
        RETURN NEW;
    END IF;

    SELECT
        permission_row.effective_from,
        permission_row.effective_until,
        permission_plane.effective_from,
        permission_plane.effective_until
    INTO
        v_permission_from,
        v_permission_until,
        v_plane_from,
        v_plane_until
    FROM mesh_control.auth_permission permission_row
    JOIN mesh_control.auth_catalog_owner owner_row
      ON owner_row.id = permission_row.catalog_owner_id
     AND owner_row.account_id IS NOT DISTINCT FROM permission_row.account_id
     AND owner_row.status = 'active'
    JOIN mesh_control.auth_permission_plane permission_plane
      ON permission_plane.permission_id = permission_row.id
     AND permission_plane.plane_code = NEW.plane_code
     AND permission_plane.status = 'active'
    JOIN mesh_control.auth_plane plane_row
      ON plane_row.plane_code = permission_plane.plane_code
     AND plane_row.status = 'active'
    WHERE permission_row.id = NEW.permission_id
      AND permission_row.status = 'published'
      AND mesh_control.authorization_v2_is_effective(
          permission_row.effective_from,
          permission_row.effective_until,
          v_now
      )
      AND mesh_control.authorization_v2_is_effective(
          permission_plane.effective_from,
          permission_plane.effective_until,
          v_now
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Mesh scope policy % cannot publish without an active exact permission-plane',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    IF NOT mesh_control.authorization_v2_window_contains(
        v_permission_from,
        v_permission_until,
        NEW.effective_from,
        NEW.effective_until
    ) OR NOT mesh_control.authorization_v2_window_contains(
        v_plane_from,
        v_plane_until,
        NEW.effective_from,
        NEW.effective_until
    ) THEN
        RAISE EXCEPTION
            'Mesh scope policy % cannot exceed its permission-plane windows',
            NEW.id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v3_scope_mapping_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.status NOT IN ('validated', 'applied')
       OR NEW.disposition IN ('retired', 'anomaly') THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM mesh.auth_scope_target target
        WHERE target.account_id = NEW.account_id
          AND target.plane_code = NEW.plane_code
          AND target.id = NEW.target_scope_id
          AND target.scope_kind = NEW.legacy_scope_kind
          AND target.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'Mesh Wave 3 scope mapping requires an active exact typed scope target';
    END IF;

    IF NEW.disposition = 'scoped_group_role'
       AND NOT EXISTS (
           SELECT 1
           FROM mesh.auth_group_role_v2 assignment
           WHERE assignment.account_id = NEW.account_id
             AND assignment.plane_code = NEW.plane_code
             AND assignment.id = NEW.target_group_role_id
             AND assignment.scope_target_id = NEW.target_scope_id
             AND assignment.status = 'active'
       ) THEN
        RAISE EXCEPTION
            'Mesh Wave 3 scoped assignment does not match its exact active scope';
    END IF;

    IF NEW.disposition = 'explicit_override'
       AND NOT EXISTS (
           SELECT 1
           FROM mesh.auth_override authority_override
           WHERE authority_override.account_id = NEW.account_id
             AND authority_override.plane_code = NEW.plane_code
             AND authority_override.id = NEW.target_override_id
             AND authority_override.scope_target_id = NEW.target_scope_id
             AND authority_override.status = 'active'
             AND authority_override.effective_from <= now()
             AND authority_override.effective_until > now()
       ) THEN
        RAISE EXCEPTION
            'Mesh Wave 3 override does not match its exact active scope';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v3_subject_mapping_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_group_count integer;
BEGIN
    IF NEW.status NOT IN ('validated', 'applied')
       OR NEW.disposition NOT IN ('mapped', 'quarantined_zero_grant') THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM mesh.auth_plane_membership membership
        WHERE membership.account_id = NEW.account_id
          AND membership.plane_code = NEW.plane_code
          AND membership.principal_id = NEW.principal_id
          AND membership.id = NEW.target_membership_id
          AND membership.status = 'active'
          AND membership.effective_from <= now()
          AND (
              membership.effective_until IS NULL
              OR membership.effective_until > now()
          )
    ) THEN
        RAISE EXCEPTION
            'Mesh Wave 3 subject mapping requires an active exact principal membership';
    END IF;

    SELECT count(DISTINCT auth_group.id)
      INTO v_group_count
      FROM unnest(NEW.target_group_ids) group_id
      JOIN mesh.auth_group_v2 auth_group
        ON auth_group.account_id = NEW.account_id
       AND auth_group.plane_code = NEW.plane_code
       AND auth_group.id = group_id
       AND auth_group.status = 'active'
      JOIN mesh.auth_group_member_v2 member
        ON member.account_id = auth_group.account_id
       AND member.plane_code = auth_group.plane_code
       AND member.group_id = auth_group.id
       AND member.principal_id = NEW.principal_id
       AND member.status = 'active'
       AND member.effective_from <= now()
       AND (member.effective_until IS NULL OR member.effective_until > now());

    IF v_group_count <> cardinality(NEW.target_group_ids) THEN
        RAISE EXCEPTION
            'Mesh Wave 3 subject mapping contains a missing, inactive, '
            'cross-account, cross-plane, or unjoined target group';
    END IF;

    IF NEW.disposition = 'quarantined_zero_grant'
       AND EXISTS (
           SELECT 1
           FROM unnest(NEW.target_group_ids) group_id
           JOIN mesh.auth_current_group_role_v assignment
             ON assignment.account_id = NEW.account_id
            AND assignment.plane_code = NEW.plane_code
            AND assignment.group_id = group_id
       ) THEN
        RAISE EXCEPTION 'Mesh Wave 3 quarantine group must have zero current role grants';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v5_consumer_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM mesh_control.authorization_runtime_release_v2 AS release
        WHERE release.plane_code = 'mesh'
          AND release.release_state = 'active'
    )
       AND (
           TG_OP = 'DELETE'
           OR NEW.enforcement_state <> 'verified'
           OR NOT NEW.exact_catalog_ids_only
       ) THEN
        RAISE EXCEPTION
            'Active Mesh Wave 5 release cannot downgrade consumer %',
            OLD.consumer_family;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_v5_release_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
    v_unverified integer;
    v_total integer;
BEGIN
    IF NEW.release_state <> 'active' THEN
        RETURN NEW;
    END IF;
    IF NEW.catalog_sha256 = repeat('0', 64)
       OR NEW.evaluator_revision = 'unpublished' THEN
        RAISE EXCEPTION
            'Mesh Wave 5 release has no compiled catalog/revision';
    END IF;
    IF NEW.observation_window_until IS NULL
       OR NEW.observation_window_until <= clock_timestamp() THEN
        RAISE EXCEPTION
            'Mesh Wave 5 release requires a future observation window';
    END IF;

    SELECT
        count(*)::integer,
        count(*) FILTER (
            WHERE consumer.enforcement_state <> 'verified'
               OR NOT consumer.exact_catalog_ids_only
               OR consumer.verification_report_ref IS NULL
               OR consumer.approved_at IS NULL
               OR consumer.approved_by IS NULL
        )::integer
    INTO v_total, v_unverified
    FROM mesh_control.authorization_consumer_migration_v2 AS consumer
    WHERE consumer.plane_code = 'mesh';
    IF v_total <> 6 OR v_unverified <> 0 THEN
        RAISE EXCEPTION
            'Mesh Wave 5 release has % of 6 families and % are unverified',
            v_total,
            v_unverified;
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_authorization_wave7_immutable_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
    RAISE EXCEPTION 'Mesh Wave 7 evidence/receipt relation is append-only';
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_policy_rule_version_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
BEGIN
    INSERT INTO mesh_control.policy_rule_version (
        policy_rule_id,
        account_code,
        rule_code,
        version_no,
        rule_snapshot,
        superseded_at,
        superseded_by
    )
    VALUES (
        OLD.id,
        OLD.account_code,
        OLD.rule_code,
        OLD.version_no,
        to_jsonb(OLD),
        now(),
        COALESCE(NEW.updated_by, OLD.updated_by, OLD.created_by, 'system')
    )
    ON CONFLICT (policy_rule_id, version_no) DO NOTHING;

    NEW.version_no := OLD.version_no + 1;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "mesh_control".trg_policy_rule_version_snapshot() IS 'Snapshots the old policy_rule row before update and increments version_no.';

CREATE OR REPLACE FUNCTION mesh_control.trg_preserved_identity_receipt_immutable_v2()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'preserved identity migration receipts are immutable';
END
$function$;

CREATE OR REPLACE FUNCTION mesh_control.trg_prevent_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
BEGIN
    RAISE EXCEPTION '% on %.% is not allowed; row is immutable',
        TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$function$;

COMMENT ON FUNCTION "mesh_control".trg_prevent_mutation() IS 'Blocks UPDATE/DELETE on immutable Mesh control history tables.';

CREATE OR REPLACE FUNCTION mesh_control.trg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mesh_control', 'pg_catalog'
AS $function$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "mesh_control".trg_set_updated_at() IS 'Sets updated_at on Mesh control tables.';
