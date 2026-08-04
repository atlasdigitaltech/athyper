-- ============================================================================
-- log/05_functions.sql
-- Functions and procedures reconstructed from the live catalog; pre-constraint routines are excluded.
-- Generated from the live Neon database log schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION log.compute_resolution_metadata(p_input_params jsonb, p_winning_rule jsonb DEFAULT NULL::jsonb, p_candidate_count smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'log', 'pg_temp'
AS $function$
DECLARE
    v_hash             text;
    v_score            smallint;
    v_predicate_keys   text[];
    v_non_null_count   smallint := 0;
    v_serialized       text;
BEGIN
    -- ── input_hash: SHA-256 of deterministic key-sorted serialization ──────
    -- CORR-3: use string_agg over jsonb_each record fields, not jsonb operators
    SELECT string_agg(
        e.key || ':' || COALESCE(e.value::text, 'null'),
        '|' ORDER BY e.key
    ) INTO v_serialized
    FROM jsonb_each(p_input_params) AS e(key, value);

    -- Handle empty/null input
    IF v_serialized IS NULL THEN
        v_serialized := '';
    END IF;

    v_hash := encode(digest(v_serialized, 'sha256'), 'hex');

    -- ── specificity_score: count non-NULL predicates on winning rule ───────
    -- Only meaningful for RULE_MATCH method; NULL for OVERRIDE/DEFAULT/FAILED
    IF p_winning_rule IS NOT NULL THEN
        v_predicate_keys := ARRAY[
            'entity_code',      'direction',         'intent_id',
            'intent_domain',    'flow_code',         'ou_id',
            'doc_type',         'currency_code',     'min_amount',
            'max_amount',       'is_cross_border',   'is_intercompany',
            'commodity_domain', 'commitment_type',   'counterparty_tier',
            'contract_value_min','contract_value_max','revenue_type'
        ];

        SELECT count(*)::smallint INTO v_non_null_count
        FROM unnest(v_predicate_keys) AS k
        WHERE p_winning_rule ? k
          AND p_winning_rule->>k IS NOT NULL;

        v_score := v_non_null_count;
    END IF;

    RETURN jsonb_build_object(
        'input_hash',        v_hash,
        'specificity_score', v_score,
        'candidate_count',   p_candidate_count);
END;
$function$;

COMMENT ON FUNCTION "log".compute_resolution_metadata(p_input_params jsonb, p_winning_rule jsonb, p_candidate_count smallint) IS 'Computes input_hash (SHA-256) and specificity_score for resolution_log entries. input_hash: deterministic key-sorted serialization of input params → SHA-256 hex. specificity_score: count of non-NULL predicates on winning rule (RULE_MATCH only). Called by resolution log writer after resolve_business_intent() or resolve_accounting_profile() returns. CORR-3: hash uses string_agg over jsonb_each record fields (not jsonb operators). Requires pgcrypto extension for digest().';

CREATE OR REPLACE FUNCTION log.create_cycle_audit_partition(p_target date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'log', 'pg_catalog'
AS $function$
DECLARE
    v_start date := date_trunc('month', p_target);
    v_name  text := 'cycle_audit_log_' || to_char(v_start, 'YYYY_MM');
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS log.%I PARTITION OF log.cycle_audit_log '
        'FOR VALUES FROM (%L) TO (%L)',
        v_name, v_start, v_start + interval '1 month');
    RETURN v_name;
END;
$function$;

CREATE OR REPLACE FUNCTION log.emit_cycle_audit(p_tenant_id uuid, p_entity_code character varying, p_cycle_type_code character varying, p_domain character varying, p_event_type character varying, p_cycle_run_id uuid DEFAULT NULL::uuid, p_target_id uuid DEFAULT NULL::uuid, p_target_type character varying DEFAULT NULL::character varying, p_actor_id uuid DEFAULT NULL::uuid, p_actor_type character varying DEFAULT 'USER'::character varying, p_from_status character varying DEFAULT NULL::character varying, p_to_status character varying DEFAULT NULL::character varying, p_payload jsonb DEFAULT '{}'::jsonb, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'log', 'pg_catalog'
AS $function$
DECLARE v_id uuid;
BEGIN
    INSERT INTO log.cycle_audit_log (
        tenant_id, entity_code, cycle_type_code, domain, event_type,
        cycle_run_id, target_id, target_type, actor_id, actor_type,
        from_status, to_status, payload, reason)
    VALUES (
        p_tenant_id, p_entity_code, p_cycle_type_code, p_domain, p_event_type,
        p_cycle_run_id, p_target_id, p_target_type, p_actor_id, p_actor_type,
        p_from_status, p_to_status, p_payload, p_reason)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION log.trg_auth_decision_evidence_v2_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
    RAISE EXCEPTION 'log.auth_decision_evidence_v2 is append-only';
END
$function$;

CREATE OR REPLACE FUNCTION log.trg_guard_notification_delivery_attempt_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'log'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'log.notification_delivery_attempt is append-only. DELETE is prohibited. '
            'Use purge_after to schedule GDPR-driven removal.'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    -- Allow UPDATE only of redaction/retention columns
    IF TG_OP = 'UPDATE' THEN
        IF OLD.id                    IS DISTINCT FROM NEW.id
        OR OLD.tenant_id             IS DISTINCT FROM NEW.tenant_id
        OR OLD.delivery_id           IS DISTINCT FROM NEW.delivery_id
        OR OLD.subscription_id       IS DISTINCT FROM NEW.subscription_id
        OR OLD.request_url           IS DISTINCT FROM NEW.request_url
        OR OLD.request_method        IS DISTINCT FROM NEW.request_method
        OR OLD.request_body          IS DISTINCT FROM NEW.request_body
        OR OLD.request_content_type  IS DISTINCT FROM NEW.request_content_type
        OR OLD.response_status       IS DISTINCT FROM NEW.response_status
        OR OLD.response_headers      IS DISTINCT FROM NEW.response_headers
        OR OLD.response_body         IS DISTINCT FROM NEW.response_body
        OR OLD.response_content_type IS DISTINCT FROM NEW.response_content_type
        OR OLD.duration_ms           IS DISTINCT FROM NEW.duration_ms
        OR OLD.is_success            IS DISTINCT FROM NEW.is_success
        OR OLD.error                 IS DISTINCT FROM NEW.error
        OR OLD.created_at            IS DISTINCT FROM NEW.created_at
        OR OLD.created_by            IS DISTINCT FROM NEW.created_by
        THEN
            RAISE EXCEPTION
                'log.notification_delivery_attempt core fields are immutable. '
                'Only is_redacted, redaction_version, body_truncated, and '
                'purge_after may be updated (credential scrubbing workflow).'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION "log".trg_guard_notification_delivery_attempt_mutation() IS 'Scoped immutability guard for notification_delivery_attempt. Blocks DELETE. Blocks UPDATE of all columns except is_redacted, redaction_version, body_truncated, purge_after.';

CREATE OR REPLACE FUNCTION log.trg_prevent_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'log', 'pg_catalog'
AS $function$
BEGIN
    RAISE EXCEPTION '% on %.% is not allowed — row is immutable',
        TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$function$;

COMMENT ON FUNCTION "log".trg_prevent_mutation() IS 'Blocks UPDATE/DELETE on immutable ledger/log rows. Attach as BEFORE UPDATE OR DELETE trigger on append-only tables such as ledger.asset_revaluation_reserve.';

CREATE OR REPLACE FUNCTION log.trg_resolution_log_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'log', 'pg_temp'
AS $function$
BEGIN
    RAISE EXCEPTION
        'resolution_log is append-only. UPDATE and DELETE are prohibited (id=%).',
        OLD.id
    USING ERRCODE = 'integrity_constraint_violation';
END;
$function$;

COMMENT ON FUNCTION "log".trg_resolution_log_immutable() IS 'Engine 4.13 §F7: immutability guard for log.resolution_log. Raises integrity_constraint_violation on any UPDATE or DELETE attempt. Called by trg_resolution_log_immutable (09_triggers/011_resolution_engine.sql).';
