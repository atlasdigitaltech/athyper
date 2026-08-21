CREATE INDEX template_version_template_recent_idx
    ON snapshot.template_version
       (tenant_id, template_id, locale_code, version DESC);

CREATE INDEX template_version_effective_idx
    ON snapshot.template_version
       (tenant_id, template_id, locale_code, effective_from, effective_to);

CREATE INDEX compiled_artifact_entity_idx
    ON snapshot.compiled_artifact (
        tenant_id, entity_type, entity_id, created_at DESC
    );

CREATE INDEX compiled_artifact_source_idx
    ON snapshot.compiled_artifact (tenant_id, source_snapshot_id);

CREATE INDEX compiled_artifact_plane_idx
    ON snapshot.compiled_artifact (
        tenant_id, plane_key, artifact_kind, created_at DESC
    )
    WHERE artifact_scope = 'plane';

CREATE INDEX compiled_artifact_hash_idx
    ON snapshot.compiled_artifact (tenant_id, compiled_hash);

CREATE INDEX compiled_artifact_created_by_idx
    ON snapshot.compiled_artifact (tenant_id, created_by);

CREATE INDEX ix_entity_contract_revision_entity
    ON snapshot.entity_contract_revision (tenant_id, entity_id, captured_at DESC);

CREATE INDEX ix_entity_contract_revision_change_set
    ON snapshot.entity_contract_revision (change_set_id, revision_no DESC);

CREATE INDEX ix_entity_contract_revision_parent
    ON snapshot.entity_contract_revision (parent_revision_id)
    WHERE parent_revision_id IS NOT NULL;

CREATE INDEX ix_entity_contract_revision_contract_hash
    ON snapshot.entity_contract_revision (contract_hash);

CREATE INDEX ix_entity_contract_revision_audit_event
    ON snapshot.entity_contract_revision (audit_event_id)
    WHERE audit_event_id IS NOT NULL;

CREATE INDEX entity_contract_test_run_change_set_idx ON snapshot.entity_contract_test_run (tenant_id, change_set_id, executed_at DESC);
CREATE INDEX entity_contract_test_run_revision_idx ON snapshot.entity_contract_test_run (tenant_id, revision_id) WHERE revision_id IS NOT NULL;
CREATE INDEX entity_contract_test_result_run_idx ON snapshot.entity_contract_test_result (tenant_id, test_run_id, ordinal);

CREATE INDEX entity_numbering_test_artifact_change_set_ix
    ON snapshot.entity_numbering_test_artifact (tenant_id, change_set_id, executed_at DESC);
CREATE INDEX entity_numbering_test_artifact_binding_ix
    ON snapshot.entity_numbering_test_artifact (tenant_id, numbering_binding_id, executed_at DESC);

CREATE INDEX ix_entity_release_artifact_entity
    ON snapshot.entity_release_artifact (tenant_id, entity_id, plane_key, created_at DESC);
CREATE INDEX ix_entity_release_artifact_hash
    ON snapshot.entity_release_artifact (compiled_hash);
