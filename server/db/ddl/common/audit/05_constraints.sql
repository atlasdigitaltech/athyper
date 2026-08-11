ALTER TABLE master.audit_reason_code
    ADD CONSTRAINT audit_reason_code_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE master.audit_reason_code
    ADD CONSTRAINT audit_reason_code_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.audit_reason_code
    ADD CONSTRAINT audit_reason_code_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE master.audit_reason_code
    ADD CONSTRAINT audit_reason_code_status_changed_by_fk
    FOREIGN KEY (tenant_id, status_changed_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE audit.audit_log
    ADD CONSTRAINT audit_log_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE audit.audit_log
    ADD CONSTRAINT audit_log_event_contract_fk
    FOREIGN KEY (event_contract_code)
    REFERENCES master.audit_event_contract(code)
    ON DELETE RESTRICT;

ALTER TABLE audit.audit_log
    ADD CONSTRAINT audit_log_actor_fk
    FOREIGN KEY (tenant_id, actor_principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE audit.audit_log
    ADD CONSTRAINT audit_log_reason_fk
    FOREIGN KEY (tenant_id, audit_reason_code_id)
    REFERENCES master.audit_reason_code (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE audit.authorization_decision_evidence
    ADD CONSTRAINT authorization_decision_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE audit.authorization_decision_evidence
    ADD CONSTRAINT authorization_decision_subject_fk
    FOREIGN KEY (tenant_id, subject_principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE audit.security_event
    ADD CONSTRAINT security_event_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE audit.security_event
    ADD CONSTRAINT security_event_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE audit.hash_anchor
    ADD CONSTRAINT hash_anchor_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;
ALTER TABLE audit.export_manifest
    ADD CONSTRAINT export_manifest_request_fk
    FOREIGN KEY (tenant_id, export_request_id)
    REFERENCES audit.export_request (tenant_id, id);

ALTER TABLE audit.export_request ADD CONSTRAINT export_request_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE audit.export_request ADD CONSTRAINT export_request_actor_fk FOREIGN KEY (tenant_id, actor_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE audit.export_manifest ADD CONSTRAINT export_manifest_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE audit.export_manifest ADD CONSTRAINT export_manifest_actor_fk FOREIGN KEY (tenant_id, actor_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE audit.integrity_check_evidence ADD CONSTRAINT integrity_check_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE audit.integrity_check_evidence ADD CONSTRAINT integrity_check_actor_fk FOREIGN KEY (tenant_id, actor_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE audit.legal_hold ADD CONSTRAINT legal_hold_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE audit.legal_hold ADD CONSTRAINT legal_hold_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE audit.legal_hold ADD CONSTRAINT legal_hold_released_by_fk FOREIGN KEY (tenant_id, released_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE audit.legal_hold_manifest
    ADD CONSTRAINT legal_hold_manifest_hold_fk
    FOREIGN KEY (tenant_id, legal_hold_id)
    REFERENCES audit.legal_hold (tenant_id, id);

ALTER TABLE audit.legal_hold_manifest ADD CONSTRAINT legal_hold_manifest_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE audit.legal_hold_manifest ADD CONSTRAINT legal_hold_manifest_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE audit.retention_policy ADD CONSTRAINT retention_policy_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
ALTER TABLE audit.retention_policy ADD CONSTRAINT retention_policy_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE audit.retention_policy ADD CONSTRAINT retention_policy_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;
