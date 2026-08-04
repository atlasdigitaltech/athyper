CREATE INDEX audit_reason_code_catalog_idx
    ON master.audit_reason_code
       (tenant_id, status, category, severity, sort_order, code);

CREATE INDEX audit_event_contract_resolution_idx
    ON master.audit_event_contract(status,priority,code);

CREATE INDEX audit_log_entity_idx
    ON audit.audit_log
       (plane_code, tenant_id, entity_type, entity_id, occurred_at DESC);

CREATE INDEX audit_log_event_idx
    ON audit.audit_log
       (plane_code, tenant_id, event_code, outcome, occurred_at DESC);

CREATE INDEX audit_log_tenant_timeline_idx
    ON audit.audit_log
       (plane_code, tenant_id, occurred_at DESC);

CREATE INDEX audit_log_actor_idx
    ON audit.audit_log
       (plane_code, tenant_id, actor_principal_id, occurred_at DESC)
    WHERE actor_principal_id IS NOT NULL;

CREATE INDEX audit_log_reason_idx
    ON audit.audit_log (tenant_id, audit_reason_code_id, occurred_at DESC)
    WHERE audit_reason_code_id IS NOT NULL;

CREATE INDEX audit_log_scope_idx
    ON audit.audit_log (tenant_id, scope_type, scope_id, occurred_at DESC)
    WHERE scope_id IS NOT NULL;

CREATE INDEX audit_log_correlation_idx
    ON audit.audit_log (correlation_id, occurred_at DESC)
    WHERE correlation_id IS NOT NULL;

CREATE INDEX audit_log_trace_idx
    ON audit.audit_log (trace_id, occurred_at DESC)
    WHERE trace_id IS NOT NULL;

CREATE INDEX authorization_decision_report_idx
    ON audit.authorization_decision_evidence
       (plane_code, tenant_id, decision, occurred_at DESC);

CREATE INDEX authorization_decision_permission_idx
    ON audit.authorization_decision_evidence
       (plane_code, tenant_id, permission_code, action, occurred_at DESC);

CREATE INDEX authorization_decision_subject_idx
    ON audit.authorization_decision_evidence
       (plane_code, tenant_id, subject_principal_id, occurred_at DESC)
    WHERE subject_principal_id IS NOT NULL;

CREATE INDEX authorization_decision_resource_idx
    ON audit.authorization_decision_evidence
       (plane_code, tenant_id, resource_type, resource_id, occurred_at DESC);

CREATE INDEX authorization_decision_trace_idx
    ON audit.authorization_decision_evidence (trace_id, occurred_at DESC)
    WHERE trace_id IS NOT NULL;

CREATE INDEX authorization_decision_reason_gin
    ON audit.authorization_decision_evidence USING gin (reason_codes);

CREATE INDEX security_event_report_idx
    ON audit.security_event
       (plane_code, tenant_id, severity, category, outcome, occurred_at DESC);

CREATE INDEX security_event_code_idx
    ON audit.security_event
       (plane_code, tenant_id, event_code, occurred_at DESC);

CREATE INDEX security_event_principal_idx
    ON audit.security_event
       (plane_code, tenant_id, principal_id, occurred_at DESC)
    WHERE principal_id IS NOT NULL;

CREATE INDEX security_event_trace_idx
    ON audit.security_event (trace_id, occurred_at DESC)
    WHERE trace_id IS NOT NULL;

CREATE INDEX hash_anchor_chain_idx
    ON audit.hash_anchor
       (plane_code, tenant_id, source_relation, window_end DESC);

CREATE INDEX hash_anchor_root_hash_idx
    ON audit.hash_anchor (root_hash);
