CREATE INDEX comment_moderation_status_idx
    ON governance.comment_moderation (tenant_id, status, created_at);
CREATE INDEX channel_consent_subject_idx
    ON governance.channel_consent (tenant_id, subject_type, subject_id);
CREATE INDEX cycle_run_type_status_idx
    ON governance.cycle_run (tenant_id, cycle_type_id, status, scheduled_start_at);
CREATE INDEX cycle_run_parent_idx
    ON governance.cycle_run (tenant_id, parent_cycle_run_id) WHERE parent_cycle_run_id IS NOT NULL;
CREATE INDEX cycle_task_run_status_idx
    ON governance.cycle_task (tenant_id, cycle_type_id, cycle_run_id, status, due_at);
CREATE INDEX cycle_task_owner_idx
    ON governance.cycle_task (tenant_id, owner_principal_id, status)
    WHERE owner_principal_id IS NOT NULL;
CREATE INDEX cycle_task_dependency_successor_idx
    ON governance.cycle_task_dependency (tenant_id, cycle_run_id, successor_task_id);
CREATE INDEX cycle_deviation_run_idx
    ON governance.cycle_deviation (tenant_id, cycle_run_id, cycle_task_id);
CREATE INDEX cycle_certification_run_idx
    ON governance.cycle_certification (tenant_id, cycle_run_id);
CREATE INDEX legal_hold_status_idx
    ON governance.legal_hold (tenant_id, status, effective_at);
CREATE INDEX legal_hold_manifest_hold_idx
    ON governance.legal_hold_manifest (tenant_id, legal_hold_id);
CREATE INDEX legal_hold_manifest_resource_idx
    ON governance.legal_hold_manifest (tenant_id, resource_kind, resource_id);
CREATE INDEX report_pack_source_idx
    ON governance.report_pack (tenant_id, source_entity_code, source_entity_id);
CREATE UNIQUE INDEX cycle_subject_primary_uq ON governance.cycle_subject(tenant_id,cycle_run_id) WHERE is_primary;
CREATE INDEX cycle_subject_case_idx ON governance.cycle_subject(tenant_id,entity_case_id) WHERE entity_case_id IS NOT NULL;
