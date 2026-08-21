CREATE OR REPLACE FUNCTION audit.trg_normalize_audit_reason_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.code := lower(btrim(NEW.code));
    NEW.name := btrim(NEW.name);
    NEW.description := nullif(btrim(NEW.description), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit.payload_is_safe(
    p_payload jsonb,
    p_max_bytes integer DEFAULT 65536
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
    v_key text;
    v_value jsonb;
BEGIN
    IF p_payload IS NULL THEN
        RETURN true;
    END IF;
    IF p_max_bytes<1 OR pg_column_size(p_payload)>p_max_bytes THEN
        RETURN false;
    END IF;
    IF jsonb_typeof(p_payload)='object' THEN
        FOR v_key,v_value IN SELECT key,value FROM pg_catalog.jsonb_each(p_payload)
        LOOP
            IF lower(v_key)~'(password|passwd|secret|token|authorization|private[_-]?key|credential|api[_-]?key)' THEN
                RETURN false;
            END IF;
            IF NOT audit.payload_is_safe(v_value,p_max_bytes) THEN
                RETURN false;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(p_payload)='array' THEN
        FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements(p_payload)
        LOOP
            IF NOT audit.payload_is_safe(v_value,p_max_bytes) THEN
                RETURN false;
            END IF;
        END LOOP;
    END IF;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION audit.trg_guard_audit_reason_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.origin = 'platform_seed'
           AND current_user <> (
               SELECT pg_get_userbyid(c.relowner)
                 FROM pg_class AS c
                 JOIN pg_namespace AS n ON n.oid = c.relnamespace
                WHERE n.nspname = TG_TABLE_SCHEMA
                  AND c.relname = TG_TABLE_NAME
           ) THEN
            RAISE EXCEPTION
                'Only tenant provisioning may create platform-seeded audit reasons'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Active or retired audit reasons cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF ROW(
        NEW.id, NEW.tenant_id, NEW.origin,
        NEW.created_at, NEW.created_by
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD.tenant_id, OLD.origin,
        OLD.created_at, OLD.created_by
    ) THEN
        RAISE EXCEPTION
            'Audit-reason ownership, origin, and creation evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.status <> 'draft'
       AND ROW(
           NEW.code, NEW.category, NEW.severity, NEW.requires_comment
       ) IS DISTINCT FROM ROW(
           OLD.code, OLD.category, OLD.severity, OLD.requires_comment
       ) THEN
        RAISE EXCEPTION
            'Active or retired audit-reason semantics are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF (OLD.status = 'active' AND NEW.status NOT IN ('active', 'retired'))
       OR (OLD.status = 'retired' AND NEW.status <> 'retired') THEN
        RAISE EXCEPTION 'Invalid audit-reason lifecycle transition'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit.trg_prepare_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit, master
AS $$
DECLARE
    v_reason_code text;
    v_requires_comment boolean;
    v_contract_code text;
    v_allowed_operations audit.operation_d[];
    v_default_severity audit.event_severity_d;
    v_allowed_actor_types audit.actor_type_d[];
    v_allowed_scope audit.event_scope_d;
    v_reason_required boolean;
    v_capture_mode audit.capture_mode_d;
    v_max_payload_bytes integer;
    v_schema_version integer;
    v_database_plane text;
BEGIN
    v_database_plane:=nullif(current_setting('app.database_plane',true),'');
    IF v_database_plane IS NULL THEN
        RAISE EXCEPTION 'app.database_plane is required for audit evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.plane_code <> v_database_plane::audit.plane_code_d THEN
        RAISE EXCEPTION 'Audit evidence plane does not match database plane'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.event_code := lower(btrim(NEW.event_code));
    NEW.entity_type := lower(btrim(NEW.entity_type));
    NEW.scope_type := nullif(lower(btrim(NEW.scope_type)), '');
    NEW.reason_comment := nullif(btrim(NEW.reason_comment), '');
    NEW.request_id := nullif(btrim(NEW.request_id), '');
    NEW.source_service := lower(btrim(NEW.source_service));
    NEW.trace_id := nullif(lower(btrim(NEW.trace_id)), '');
    NEW.span_id := nullif(lower(btrim(NEW.span_id)), '');

    SELECT code,allowed_operations,default_severity,allowed_actor_types,
           allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version
      INTO v_contract_code,v_allowed_operations,v_default_severity,v_allowed_actor_types,
           v_allowed_scope,v_reason_required,v_capture_mode,v_max_payload_bytes,v_schema_version
      FROM master.audit_event_contract
     WHERE status='active' AND NEW.event_code~event_code_pattern
     ORDER BY priority,code
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active audit event contract matches %',NEW.event_code
            USING ERRCODE='foreign_key_violation';
    END IF;
    IF NOT NEW.operation=ANY(v_allowed_operations) THEN
        RAISE EXCEPTION 'Operation % is not allowed by audit contract %',NEW.operation,v_contract_code
            USING ERRCODE='check_violation';
    END IF;
    IF NOT NEW.actor_type=ANY(v_allowed_actor_types) THEN
        RAISE EXCEPTION 'Actor type % is not allowed by audit contract %',NEW.actor_type,v_contract_code
            USING ERRCODE='check_violation';
    END IF;
    IF (v_allowed_scope='tenant' AND NEW.tenant_id IS NULL)
       OR (v_allowed_scope='platform' AND NEW.tenant_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Audit scope does not match contract %',v_contract_code
            USING ERRCODE='check_violation';
    END IF;
    IF v_reason_required AND NEW.audit_reason_code_id IS NULL THEN
        RAISE EXCEPTION 'Audit contract % requires a reason code',v_contract_code
            USING ERRCODE='not_null_violation';
    END IF;
    IF NEW.tenant_id IS NOT NULL AND NEW.actor_principal_id IS NOT NULL
       AND NOT EXISTS(
           SELECT 1 FROM master.principal
            WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_principal_id
       ) THEN
        RAISE EXCEPTION 'Audit actor does not belong to the evidence tenant'
            USING ERRCODE='foreign_key_violation';
    END IF;
    IF NOT audit.payload_is_safe(NEW.old_values,v_max_payload_bytes)
       OR NOT audit.payload_is_safe(NEW.new_values,v_max_payload_bytes)
       OR NOT audit.payload_is_safe(NEW.context,v_max_payload_bytes)
       OR pg_column_size(coalesce(NEW.old_values,'{}'::jsonb))
          +pg_column_size(coalesce(NEW.new_values,'{}'::jsonb))
          +pg_column_size(NEW.context)>v_max_payload_bytes THEN
        RAISE EXCEPTION 'Audit payload is unsafe or exceeds contract limit'
            USING ERRCODE='program_limit_exceeded';
    END IF;
    IF v_capture_mode='metadata' AND (NEW.old_values IS NOT NULL OR NEW.new_values IS NOT NULL) THEN
        RAISE EXCEPTION 'Audit contract % permits metadata only',v_contract_code
            USING ERRCODE='check_violation';
    END IF;
    IF v_capture_mode='changed_fields' AND (NEW.old_values IS NOT NULL OR NEW.new_values IS NOT NULL) THEN
        RAISE EXCEPTION 'Audit contract % permits changed-field names but not row values',v_contract_code
            USING ERRCODE='check_violation';
    END IF;
    NEW.event_contract_code:=v_contract_code;
    NEW.event_schema_version:=v_schema_version;
    NEW.severity:=coalesce(NEW.severity,v_default_severity);

    IF NEW.event_code LIKE 'ai.byok.%' THEN
        IF NEW.event_code NOT IN (
            'ai.byok.created',
            'ai.byok.resolved',
            'ai.byok.unavailable',
            'ai.byok.rotated',
            'ai.byok.revoked',
            'ai.byok.reencrypted',
            'ai.byok.cache_evicted',
            'ai.byok.recovery_verified'
        ) THEN
            RAISE EXCEPTION 'Unsupported BYOK audit event: %', NEW.event_code
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.entity_type <> 'ai.byok_provider_binding'
           OR NEW.entity_id <> NEW.tenant_id
           OR coalesce(NEW.context->>'provider_id', '') !~
              '^[a-z0-9][a-z0-9._-]{0,63}$' THEN
            RAISE EXCEPTION 'Invalid BYOK audit entity or provider identifier'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.context ? 'reference_fingerprint'
           AND NEW.context->>'reference_fingerprint' IS NOT NULL
           AND NEW.context->>'reference_fingerprint' !~
              '^(ref|credential):hmac-sha256:v[0-9]+:[0-9a-f]{32}$' THEN
            RAISE EXCEPTION 'Invalid BYOK audit fingerprint'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.event_code LIKE 'ai.support.%' THEN
        IF NEW.event_code NOT IN (
            'ai.support.access_started',
            'ai.support.data_read',
            'ai.support.exported',
            'ai.support.access_ended',
            'ai.support.access_denied'
        ) THEN
            RAISE EXCEPTION 'Unsupported support audit event: %', NEW.event_code
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.entity_type <> 'ai.support_session'
           OR NEW.actor_type <> 'support'
           OR NEW.actor_principal_id IS NULL
           OR NEW.scope_type <> 'tenant'
           OR NEW.scope_id <> NEW.tenant_id THEN
            RAISE EXCEPTION 'Invalid support-session audit coordinates'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.context ? 'resource_hash'
           AND NEW.context->>'resource_hash' IS NOT NULL
           AND NEW.context->>'resource_hash' !~ '^[0-9a-f]{64}$' THEN
            RAISE EXCEPTION 'Invalid support-session audit resource hash'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.audit_reason_code_id IS NULL THEN
        NEW.audit_reason_code_snapshot := NULL;
        IF NEW.reason_comment IS NOT NULL THEN
            RAISE EXCEPTION 'reason_comment requires audit_reason_code_id'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    SELECT code, requires_comment
      INTO v_reason_code, v_requires_comment
      FROM master.audit_reason_code
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.audit_reason_code_id
       AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active audit reason code does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    NEW.audit_reason_code_snapshot := v_reason_code;
    IF v_requires_comment AND NEW.reason_comment IS NULL THEN
        RAISE EXCEPTION 'Selected audit reason requires reason_comment'
            USING ERRCODE = 'not_null_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit.append_event(
    p_event_code text,
    p_operation audit.operation_d,
    p_entity_type text,
    p_entity_id uuid DEFAULT NULL,
    p_outcome audit.outcome_d DEFAULT 'success',
    p_severity audit.event_severity_d DEFAULT NULL,
    p_scope_type text DEFAULT 'tenant',
    p_scope_id uuid DEFAULT NULL,
    p_audit_reason_code_id uuid DEFAULT NULL,
    p_reason_comment text DEFAULT NULL,
    p_old_values jsonb DEFAULT NULL,
    p_new_values jsonb DEFAULT NULL,
    p_changed_fields text[] DEFAULT NULL,
    p_context jsonb DEFAULT '{}'::jsonb,
    p_correlation_id uuid DEFAULT NULL,
    p_request_id text DEFAULT NULL,
    p_occurred_at timestamptz DEFAULT clock_timestamp()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,audit,master,shared
AS $$
DECLARE
    v_id uuid;
    v_tenant_id uuid:=shared.current_tenant_id();
    v_actor_id uuid:=master.current_principal_id_soft();
    v_actor_type audit.actor_type_d;
    v_plane audit.plane_code_d;
    v_severity audit.event_severity_d;
    v_trace_id char(32):=nullif(current_setting('app.trace_id',true),'')::char(32);
    v_span_id char(16):=nullif(current_setting('app.span_id',true),'')::char(16);
BEGIN
    v_plane:=current_setting('app.database_plane')::audit.plane_code_d;
    v_actor_type:=coalesce(
        nullif(current_setting('app.current_actor_type',true),'')::audit.actor_type_d,
        CASE WHEN v_actor_id IS NULL THEN 'system'::audit.actor_type_d ELSE 'user'::audit.actor_type_d END
    );
    SELECT default_severity INTO v_severity
      FROM master.audit_event_contract
     WHERE status='active' AND lower(btrim(p_event_code))~event_code_pattern
     ORDER BY priority,code LIMIT 1;
    v_severity:=coalesce(p_severity,v_severity,'info'::audit.event_severity_d);

    INSERT INTO audit.audit_log(
        tenant_id,plane_code,event_code,event_contract_code,event_schema_version,
        operation,outcome,severity,entity_type,entity_id,scope_type,scope_id,
        actor_principal_id,actor_type,audit_reason_code_id,reason_comment,
        old_values,new_values,changed_fields,context,source_service,
        trace_id,span_id,correlation_id,request_id,occurred_at,recorded_at
    ) VALUES (
        v_tenant_id,v_plane,p_event_code,'pending',1,
        p_operation,p_outcome,v_severity,p_entity_type,p_entity_id,
        coalesce(p_scope_type,'tenant'),coalesce(p_scope_id,v_tenant_id),
        v_actor_id,v_actor_type,p_audit_reason_code_id,p_reason_comment,
        p_old_values,p_new_values,p_changed_fields,coalesce(p_context,'{}'::jsonb),
        coalesce(nullif(current_setting('application_name',true),''),'unknown'),
        v_trace_id,v_span_id,p_correlation_id,p_request_id,p_occurred_at,
        greatest(clock_timestamp(),p_occurred_at)
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION audit.trg_capture_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,audit
AS $$
DECLARE
    v_old jsonb:=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
    v_new jsonb:=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
    v_row jsonb:=CASE WHEN TG_OP='DELETE' THEN v_old ELSE v_new END;
    v_changed text[];
    v_operation audit.operation_d;
    v_suffix text;
BEGIN
    -- Skip during DDL/seed execution where the runtime session context is absent.
    IF nullif(current_setting('app.current_tenant_id', true), '') IS NULL THEN
        RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_OP='INSERT' THEN v_operation:='create'; v_suffix:='row_created';
    ELSIF TG_OP='UPDATE' THEN v_operation:='update'; v_suffix:='row_updated';
    ELSE v_operation:='delete'; v_suffix:='row_deleted'; END IF;

    IF TG_OP='UPDATE' THEN
        IF v_old = v_new THEN
            RETURN NEW;
        END IF;
        SELECT array_agg(k ORDER BY k) INTO v_changed
          FROM (
              SELECT key AS k
                FROM jsonb_object_keys(v_old||v_new) AS keys(key)
               WHERE v_old->key IS DISTINCT FROM v_new->key
          ) AS changed;
    END IF;

    PERFORM audit.append_event(
        p_event_code=>'record.'||v_suffix,
        p_operation=>v_operation,
        p_entity_type=>format('%s.%s',TG_TABLE_SCHEMA,TG_TABLE_NAME),
        p_entity_id=>(v_row->>'id')::uuid,
        p_changed_fields=>v_changed,
        p_context=>jsonb_build_object(
            'capture_mode','database_metadata',
            'trigger_depth',pg_trigger_depth(),
            'transaction_id',txid_current()
        )
    );
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Tenant provisioning calls this after the tenant provisioning principal
-- exists. Codes describe why an event occurred; event identity never belongs
-- in this catalog.
CREATE OR REPLACE FUNCTION master.seed_audit_reason_catalog(
    p_tenant_id uuid,
    p_actor_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, master, audit
AS $$
DECLARE
    v_inserted integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM master.principal
         WHERE tenant_id = p_tenant_id
           AND id = p_actor_id
    ) THEN
        RAISE EXCEPTION 'Provisioning principal does not belong to tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    INSERT INTO master.audit_reason_code (
        tenant_id, code, name, description,
        category, severity, requires_comment,
        origin, sort_order, metadata, status, created_by
    )
    SELECT
        p_tenant_id,
        v.code,
        v.name,
        v.description,
        v.category::audit.reason_category_d,
        v.severity::audit.reason_severity_d,
        v.requires_comment,
        'platform_seed',
        v.sort_order,
        jsonb_build_object(
            '_seed',
            jsonb_build_object(
                'pack', 'audit_reason_code',
                'version', '2.0.0'
            )
        ),
        'active',
        p_actor_id
    FROM (VALUES
        ('manual_correction', 'Manual Correction',
         'A user corrected information after identifying an error.',
         'data_correction', 'elevated', true, 10::smallint),
        ('policy_exception', 'Policy Exception',
         'An authorized exception to normal policy or automated controls.',
         'configuration', 'critical', true, 20::smallint),
        ('incorrect_account_assignment', 'Incorrect Account Assignment',
         'The previous accounting assignment was incorrect.',
         'accounting', 'elevated', true, 30::smallint),
        ('regulatory_requirement', 'Regulatory Requirement',
         'The change was required by law, regulation, or an authority.',
         'financial', 'elevated', true, 40::smallint),
        ('customer_request', 'Customer Request',
         'The change was requested by the affected customer or tenant.',
         'workflow', 'normal', true, 50::smallint),
        ('security_response', 'Security Response',
         'The action responded to a security incident or identified threat.',
         'security', 'critical', true, 60::smallint),
        ('authorization_exception', 'Authorization Exception',
         'An authorized access or entitlement exception was applied.',
         'authorization', 'critical', true, 70::smallint),
        ('integration_reconciliation', 'Integration Reconciliation',
         'The change reconciled application data with an external system.',
         'integration', 'elevated', true, 80::smallint),
        ('data_restoration', 'Data Restoration',
         'Previously captured state was restored for recovery or correction.',
         'snapshot', 'elevated', true, 90::smallint),
        ('duplicate_resolution', 'Duplicate Resolution',
         'Duplicate information was merged, retired, or removed.',
         'data_correction', 'normal', false, 100::smallint),
        ('request_revision', 'Request Revision',
         'Approver sent the document back for originator revision.',
         'workflow', 'normal', true, 110::smallint),
        ('approver_correction', 'Approver Correction',
         'Approver corrected a pending item without returning it to draft.',
         'workflow', 'elevated', true, 120::smallint),
        ('manual_account_override', 'Manual Account Override',
         'A user selected a GL account outside automatic account resolution.',
         'accounting', 'elevated', true, 130::smallint),
        ('tax_recalculation', 'Tax Recalculation',
         'Tax was recalculated after an earlier document calculation.',
         'accounting', 'normal', true, 140::smallint),
        ('posting_adjustment', 'Posting Adjustment',
         'Finance adjusted posting values after normal derivation.',
         'financial', 'critical', true, 150::smallint),
        ('restore_snapshot', 'Restore From Snapshot',
         'Application state was restored from a previously captured snapshot.',
         'snapshot', 'elevated', true, 160::smallint),
        -- PII / privacy
        ('pii_access_authorized', 'PII Access — Authorized Purpose',
         'Access to personal data for a documented lawful or business purpose.',
         'security', 'elevated', true, 170::smallint),
        ('pii_subject_request', 'PII Access — Data Subject Request',
         'Response to a data subject right request (access, erasure, or portability).',
         'data_correction', 'elevated', true, 180::smallint),
        ('pii_retention_purge', 'PII Purge — Retention Policy',
         'Personal data removed on expiry of the configured retention period.',
         'data_correction', 'normal', false, 190::smallint),
        -- Audit integrity
        ('audit_integrity_check', 'Audit Integrity Verification',
         'Routine or on-demand verification of audit chain integrity.',
         'security', 'normal', false, 200::smallint),
        ('audit_tamper_response', 'Audit Tamper Response',
         'Action taken in response to detected audit log tampering.',
         'security', 'critical', true, 210::smallint),
        -- IAM session
        ('session_security_lockout', 'Session — Security Lockout',
         'Session forcibly invalidated due to a security threat or policy violation.',
         'security', 'elevated', true, 220::smallint),
        ('session_device_lost', 'Session — Lost or Stolen Device',
         'Session revoked after the user reported a lost or stolen device.',
         'security', 'elevated', true, 230::smallint),
        -- Finance period lifecycle
        ('period_month_end_close', 'Period Close — Month End',
         'Routine month-end accounting period closure.',
         'financial', 'normal', false, 240::smallint),
        ('period_year_end_close', 'Period Close — Year End',
         'Annual accounting period closure.',
         'financial', 'elevated', true, 250::smallint),
        ('period_reopen_correction', 'Period Reopen — Correction',
         'Accounting period reopened to apply a correction or late entry.',
         'financial', 'critical', true, 260::smallint),
        -- Configuration changes
        ('config_compliance_update', 'Configuration — Compliance Requirement',
         'System configuration changed to satisfy a regulatory or compliance requirement.',
         'configuration', 'elevated', true, 270::smallint),
        ('config_maintenance_update', 'Configuration — Scheduled Maintenance',
         'Routine scheduled configuration update or system maintenance.',
         'configuration', 'normal', false, 280::smallint),
        -- Support / break-glass
        ('support_escalation', 'Support Escalation — Authorized Access',
         'AI-assisted support access following formal escalation approval.',
         'security', 'critical', true, 290::smallint),
        ('emergency_access', 'Emergency Break-Glass Access',
         'Break-glass access invoked for emergency system recovery.',
         'security', 'critical', true, 300::smallint),
        -- Workflow / finance exceptions
        ('workflow_bypass', 'Workflow Step Bypass',
         'An approval or workflow step was bypassed under an authorized exception.',
         'workflow', 'critical', true, 310::smallint),
        ('budget_variance_override', 'Budget Variance Override',
         'Transaction approved despite exceeding the configured budget tolerance.',
         'financial', 'critical', true, 320::smallint),
        ('late_journal_entry', 'Late Journal Entry',
         'A journal entry posted after the normal period deadline.',
         'accounting', 'elevated', true, 330::smallint),
        -- Schema / import
        ('schema_rollback', 'Schema Rollback',
         'An entity schema change was rolled back after validation failure.',
         'configuration', 'elevated', true, 340::smallint),
        ('import_reprocess', 'Import Reprocess',
         'A failed or partial import was reprocessed after correction.',
         'integration', 'normal', false, 350::smallint)
    ) AS v(
        code, name, description, category,
        severity, requires_comment, sort_order
    )
    ON CONFLICT (tenant_id, code) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION master.seed_audit_reason_catalog(uuid, uuid) IS
  'Idempotently installs tenant-local platform audit reasons after the provisioning principal exists.';

CREATE OR REPLACE FUNCTION audit.trg_guard_audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'audit.audit_log is append-only'
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE OR REPLACE FUNCTION audit.trg_prepare_authorization_decision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, audit
AS $$
BEGIN
    IF nullif(current_setting('app.database_plane', true), '') IS NULL
       OR NEW.plane_code <>
          current_setting('app.database_plane')::audit.plane_code_d THEN
        RAISE EXCEPTION
            'Authorization evidence plane does not match database plane'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.subject_ref := nullif(btrim(NEW.subject_ref), '');
    NEW.permission_code := lower(btrim(NEW.permission_code));
    NEW.action := lower(btrim(NEW.action));
    NEW.resource_type := lower(btrim(NEW.resource_type));
    NEW.resource_id := nullif(btrim(NEW.resource_id), '');
    NEW.policy_code := nullif(lower(btrim(NEW.policy_code)), '');
    NEW.policy_version := nullif(btrim(NEW.policy_version), '');
    NEW.source_service := lower(btrim(NEW.source_service));
    NEW.trace_id := nullif(lower(btrim(NEW.trace_id)), '');
    NEW.span_id := nullif(lower(btrim(NEW.span_id)), '');
    NEW.request_id := nullif(btrim(NEW.request_id), '');

    IF NEW.tenant_id IS NOT NULL
       AND NEW.subject_principal_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM master.principal
            WHERE tenant_id = NEW.tenant_id
              AND id = NEW.subject_principal_id
       ) THEN
        RAISE EXCEPTION
            'Authorization subject does not belong to the evidence tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT coalesce(array_agg(lower(btrim(reason_code))), '{}')
      INTO NEW.reason_codes
      FROM unnest(NEW.reason_codes) AS reason_code;

    IF EXISTS (
        SELECT 1
          FROM unnest(NEW.reason_codes) AS reason_code
         WHERE reason_code = ''
            OR reason_code !~ '^[a-z][a-z0-9_.:-]{0,190}$'
    ) THEN
        RAISE EXCEPTION 'Invalid authorization reason code'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit.trg_prepare_security_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, audit
AS $$
BEGIN
    IF nullif(current_setting('app.database_plane', true), '') IS NULL
       OR NEW.plane_code <>
          current_setting('app.database_plane')::audit.plane_code_d THEN
        RAISE EXCEPTION 'Security event plane does not match database plane'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.event_code := lower(btrim(NEW.event_code));
    NEW.session_id := nullif(btrim(NEW.session_id), '');
    NEW.detection_rule := nullif(lower(btrim(NEW.detection_rule)), '');
    NEW.source_service := lower(btrim(NEW.source_service));
    NEW.trace_id := nullif(lower(btrim(NEW.trace_id)), '');
    NEW.span_id := nullif(lower(btrim(NEW.span_id)), '');
    NEW.request_id := nullif(btrim(NEW.request_id), '');
    IF NEW.tenant_id IS NOT NULL
       AND NEW.principal_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM master.principal
            WHERE tenant_id = NEW.tenant_id
              AND id = NEW.principal_id
       ) THEN
        RAISE EXCEPTION
            'Security-event principal does not belong to the evidence tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit.trg_prepare_hash_anchor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, audit
AS $$
DECLARE
    v_expected_previous text;
BEGIN
    IF nullif(current_setting('app.database_plane', true), '') IS NULL
       OR NEW.plane_code <>
          current_setting('app.database_plane')::audit.plane_code_d THEN
        RAISE EXCEPTION 'Hash anchor plane does not match database plane'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.source_relation := lower(btrim(NEW.source_relation));
    NEW.root_hash := lower(btrim(NEW.root_hash));
    NEW.previous_hash := nullif(lower(btrim(NEW.previous_hash)), '');
    NEW.algorithm := lower(btrim(NEW.algorithm));
    NEW.source_service := lower(btrim(NEW.source_service));

    IF NEW.source_relation NOT IN (
        'audit.audit_log',
        'audit.authorization_decision_evidence',
        'audit.security_event'
    ) THEN
        RAISE EXCEPTION 'Unsupported hash-anchor source relation: %',
            NEW.source_relation USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.window_end > clock_timestamp() THEN
        RAISE EXCEPTION 'Hash anchors require a closed evidence window'
            USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
        SELECT 1 FROM audit.hash_anchor AS existing
         WHERE existing.plane_code = NEW.plane_code
           AND existing.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
           AND existing.source_relation = NEW.source_relation
           AND tstzrange(existing.window_start, existing.window_end, '[)')
               && tstzrange(NEW.window_start, NEW.window_end, '[)')
    ) THEN
        RAISE EXCEPTION 'Hash-anchor evidence windows may not overlap'
            USING ERRCODE = 'exclusion_violation';
    END IF;

    SELECT root_hash INTO v_expected_previous
      FROM audit.hash_anchor
     WHERE plane_code = NEW.plane_code
       AND tenant_id IS NOT DISTINCT FROM NEW.tenant_id
       AND source_relation = NEW.source_relation
       AND window_end <= NEW.window_start
     ORDER BY window_end DESC, anchored_at DESC
     LIMIT 1;
    IF NEW.previous_hash IS DISTINCT FROM v_expected_previous THEN
        RAISE EXCEPTION 'Hash-anchor previous_hash does not continue the chain'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit.trg_guard_immutable_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION '%.% is immutable', TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE OR REPLACE FUNCTION audit.trg_guard_event_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Audit event contracts cannot be deleted; retire them'
            USING ERRCODE = 'restrict_violation';
    END IF;

    NEW.code := lower(btrim(NEW.code));
    NEW.event_code_pattern := btrim(NEW.event_code_pattern);
    PERFORM '' ~ NEW.event_code_pattern;

    IF TG_OP = 'UPDATE' THEN
        IF ROW(NEW.id, NEW.code, NEW.created_at) IS DISTINCT FROM
           ROW(OLD.id, OLD.code, OLD.created_at) THEN
            RAISE EXCEPTION 'Audit event contract identity is immutable'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF ROW(
            NEW.event_code_pattern, NEW.allowed_operations,
            NEW.default_severity, NEW.allowed_actor_types,
            NEW.allowed_scope, NEW.reason_required, NEW.capture_mode,
            NEW.max_payload_bytes
        ) IS DISTINCT FROM ROW(
            OLD.event_code_pattern, OLD.allowed_operations,
            OLD.default_severity, OLD.allowed_actor_types,
            OLD.allowed_scope, OLD.reason_required, OLD.capture_mode,
            OLD.max_payload_bytes
        ) AND NEW.schema_version <= OLD.schema_version THEN
            RAISE EXCEPTION
                'Audit contract semantic changes require a higher schema_version'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.schema_version < OLD.schema_version THEN
            RAISE EXCEPTION 'Audit contract schema_version cannot decrease'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit.install_schema_row_triggers(p_schema text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit
AS $$
DECLARE
    v_table record;
    v_installed integer := 0;
BEGIN
    FOR v_table IN
        SELECT c.oid, c.relname
          FROM pg_class AS c
          JOIN pg_namespace AS n ON n.oid = c.relnamespace
         WHERE n.nspname = p_schema
           AND c.relkind = 'r'
           AND EXISTS (
               SELECT 1 FROM pg_attribute AS a
                WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
                  AND a.atttypid = 'uuid'::regtype
                  AND a.attnum > 0 AND NOT a.attisdropped
           )
           AND EXISTS (
               SELECT 1 FROM pg_attribute AS a
                WHERE a.attrelid = c.oid AND a.attname = 'id'
                  AND a.atttypid = 'uuid'::regtype
                  AND a.attnum > 0 AND NOT a.attisdropped
           )
           AND NOT EXISTS (
               SELECT 1 FROM pg_trigger AS t
                WHERE t.tgrelid = c.oid
                  AND t.tgname = 'trg_zz_audit_row_change'
                  AND NOT t.tgisinternal
           )
         ORDER BY c.relname
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_zz_audit_row_change '
            'AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
            'FOR EACH ROW EXECUTE FUNCTION audit.trg_capture_row_change()',
            p_schema, v_table.relname
        );
        v_installed := v_installed + 1;
    END LOOP;
    RETURN v_installed;
END;
$$;

CREATE OR REPLACE FUNCTION audit.ensure_monthly_partitions(
    p_start_month date,
    p_months integer DEFAULT 4
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit
AS $$
DECLARE
    v_parent text;
    v_month_start date;
    v_month_end date;
    v_partition text;
    v_created integer := 0;
    v_offset integer;
BEGIN
    IF p_start_month IS NULL
       OR p_start_month <> date_trunc('month', p_start_month)::date THEN
        RAISE EXCEPTION 'Partition start must be the first day of a month'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_months NOT BETWEEN 1 AND 24 THEN
        RAISE EXCEPTION 'Partition horizon must be between 1 and 24 months'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    FOREACH v_parent IN ARRAY ARRAY[
        'audit_log',
        'authorization_decision_evidence',
        'security_event'
    ] LOOP
        FOR v_offset IN 0..p_months - 1 LOOP
            v_month_start := (p_start_month + make_interval(months => v_offset))::date;
            v_month_end := (v_month_start + interval '1 month')::date;
            v_partition := format('%s_%s', v_parent, to_char(v_month_start, 'YYYYMM'));

            IF to_regclass(format('audit.%I', v_partition)) IS NULL THEN
                EXECUTE format(
                    'CREATE TABLE audit.%I PARTITION OF audit.%I '
                    'FOR VALUES FROM (%L) TO (%L)',
                    v_partition, v_parent, v_month_start, v_month_end
                );
                v_created := v_created + 1;
            END IF;
        END LOOP;
    END LOOP;
    RETURN v_created;
END;
$$;

CREATE OR REPLACE FUNCTION audit.create_hash_anchor(
    p_tenant_id uuid,
    p_source_relation text,
    p_window_start timestamptz,
    p_window_end timestamptz,
    p_correlation_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit
AS $$
DECLARE
    v_plane audit.plane_code_d;
    v_previous text;
    v_content_hash text;
    v_root_hash text;
    v_event_count bigint;
    v_id uuid;
BEGIN
    p_source_relation := lower(btrim(p_source_relation));
    IF p_source_relation NOT IN (
        'audit.audit_log',
        'audit.authorization_decision_evidence',
        'audit.security_event'
    ) THEN
        RAISE EXCEPTION 'Unsupported hash-anchor source relation: %',
            p_source_relation USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_window_start IS NULL OR p_window_end IS NULL
       OR p_window_end <= p_window_start OR p_window_end > clock_timestamp() THEN
        RAISE EXCEPTION 'Hash anchor requires a valid closed evidence window'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    v_plane := current_setting('app.database_plane')::audit.plane_code_d;
    PERFORM pg_advisory_xact_lock(
        hashtext(v_plane::text || ':' || coalesce(p_tenant_id::text, '<platform>')),
        hashtext(p_source_relation)
    );

    SELECT root_hash INTO v_previous
      FROM audit.hash_anchor
     WHERE plane_code = v_plane
       AND tenant_id IS NOT DISTINCT FROM p_tenant_id
       AND source_relation = p_source_relation
       AND window_end <= p_window_start
     ORDER BY window_end DESC, anchored_at DESC
     LIMIT 1;

    EXECUTE format(
        'SELECT count(*), encode(public.digest('
        'coalesce(string_agg(to_jsonb(e)::text, E''\\n'' ORDER BY occurred_at, id), ''''), '
        '''sha256''), ''hex'') FROM %s AS e '
        'WHERE tenant_id IS NOT DISTINCT FROM $1 '
        'AND occurred_at >= $2 AND occurred_at < $3',
        p_source_relation
    ) INTO v_event_count, v_content_hash
      USING p_tenant_id, p_window_start, p_window_end;

    v_root_hash := encode(public.digest(
        coalesce(v_previous, '') || ':' || v_event_count::text || ':' || v_content_hash,
        'sha256'
    ), 'hex');

    INSERT INTO audit.hash_anchor (
        tenant_id, plane_code, source_relation, window_start, window_end,
        event_count, root_hash, previous_hash, correlation_id
    ) VALUES (
        p_tenant_id, v_plane, p_source_relation, p_window_start, p_window_end,
        v_event_count, v_root_hash, v_previous, p_correlation_id
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION audit.verify_hash_anchor(p_anchor_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit
AS $$
DECLARE
    v_anchor audit.hash_anchor%ROWTYPE;
    v_content_hash text;
    v_root_hash text;
    v_event_count bigint;
BEGIN
    SELECT * INTO v_anchor FROM audit.hash_anchor WHERE id = p_anchor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hash anchor does not exist: %', p_anchor_id
            USING ERRCODE = 'no_data_found';
    END IF;

    EXECUTE format(
        'SELECT count(*), encode(public.digest('
        'coalesce(string_agg(to_jsonb(e)::text, E''\\n'' ORDER BY occurred_at, id), ''''), '
        '''sha256''), ''hex'') FROM %s AS e '
        'WHERE tenant_id IS NOT DISTINCT FROM $1 '
        'AND occurred_at >= $2 AND occurred_at < $3',
        v_anchor.source_relation
    ) INTO v_event_count, v_content_hash
      USING v_anchor.tenant_id, v_anchor.window_start, v_anchor.window_end;

    v_root_hash := encode(public.digest(
        coalesce(v_anchor.previous_hash, '') || ':' ||
        v_event_count::text || ':' || v_content_hash,
        'sha256'
    ), 'hex');
    RETURN v_event_count = v_anchor.event_count
       AND v_root_hash = v_anchor.root_hash;
END;
$$;

CREATE OR REPLACE FUNCTION audit.append_platform_event(
    p_event_code text,
    p_operation audit.operation_d,
    p_entity_type text,
    p_scope_id uuid,
    p_entity_id uuid DEFAULT NULL,
    p_outcome audit.outcome_d DEFAULT 'success',
    p_severity audit.event_severity_d DEFAULT NULL,
    p_context jsonb DEFAULT '{}'::jsonb,
    p_correlation_id uuid DEFAULT NULL,
    p_request_id text DEFAULT NULL,
    p_occurred_at timestamptz DEFAULT clock_timestamp()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit, master
AS $$
DECLARE
    v_id uuid;
    v_plane audit.plane_code_d;
    v_severity audit.event_severity_d;
BEGIN
    IF p_scope_id IS NULL THEN
        RAISE EXCEPTION 'Platform audit events require scope_id'
            USING ERRCODE = 'not_null_violation';
    END IF;
    v_plane := current_setting('app.database_plane')::audit.plane_code_d;
    SELECT default_severity INTO v_severity
      FROM master.audit_event_contract
     WHERE status = 'active' AND p_event_code ~ event_code_pattern
     ORDER BY priority, code LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active audit event contract matches %', p_event_code
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    INSERT INTO audit.audit_log (
        tenant_id, plane_code, event_code, event_contract_code,
        event_schema_version, operation, outcome, severity,
        entity_type, entity_id, scope_type, scope_id,
        actor_principal_id, actor_type, context, source_service,
        correlation_id, request_id, occurred_at
    ) VALUES (
        NULL, v_plane, p_event_code, 'pending', 1,
        p_operation, p_outcome, coalesce(p_severity, v_severity),
        p_entity_type, p_entity_id, 'platform', p_scope_id,
        NULL, 'system', coalesce(p_context, '{}'::jsonb),
        coalesce(nullif(current_setting('application_name', true), ''), 'unknown'),
        p_correlation_id, p_request_id, p_occurred_at
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION audit.trg_guard_export_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, audit
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Audit export requests cannot be deleted' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.plane_code IS DISTINCT FROM OLD.plane_code
       OR NEW.actor_principal_id IS DISTINCT FROM OLD.actor_principal_id
       OR NEW.exact_filter IS DISTINCT FROM OLD.exact_filter
       OR NEW.export_format IS DISTINCT FROM OLD.export_format
       OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
       OR NEW.retention_until IS DISTINCT FROM OLD.retention_until THEN
        RAISE EXCEPTION 'Audit export request scope is immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF (OLD.status, NEW.status) NOT IN (('queued','running'),('queued','failed'),('running','completed'),('running','failed'),('completed','expired'),('failed','expired')) THEN
        RAISE EXCEPTION 'Invalid audit export status transition % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION audit.trg_guard_legal_hold()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, audit
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Legal holds cannot be deleted' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.matter_code IS DISTINCT FROM OLD.matter_code OR NEW.exact_filter IS DISTINCT FROM OLD.exact_filter
       OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR OLD.status <> 'active' OR NEW.status <> 'released' THEN
        RAISE EXCEPTION 'Only release of an active legal hold is allowed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
