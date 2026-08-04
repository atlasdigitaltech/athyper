CREATE INDEX ix_metadata_entity_module_status
    ON metadata.entity (module_id, status, entity_code);

CREATE INDEX ix_metadata_entity_tenant_class
    ON metadata.entity (tenant_id, entity_class, status);

CREATE UNIQUE INDEX ux_entity_change_set_open_branch
    ON metadata.entity_change_set (tenant_id, entity_id, branch_code)
    NULLS NOT DISTINCT
    WHERE status IN ('draft', 'in_review', 'rejected');

CREATE INDEX ix_entity_change_set_entity_status
    ON metadata.entity_change_set (tenant_id, entity_id, status, updated_at DESC NULLS LAST);

CREATE INDEX ix_entity_change_set_parent
    ON metadata.entity_change_set (parent_change_set_id)
    WHERE parent_change_set_id IS NOT NULL;

CREATE INDEX ix_entity_change_set_base_release
    ON metadata.entity_change_set (base_release_id)
    WHERE base_release_id IS NOT NULL;

CREATE UNIQUE INDEX ux_entity_release_successor
    ON metadata.entity_release (supersedes_release_id)
    WHERE supersedes_release_id IS NOT NULL;

CREATE INDEX ix_entity_release_current
    ON metadata.entity_release (tenant_id, entity_id, release_no DESC);

CREATE INDEX ix_entity_release_change_set
    ON metadata.entity_release (change_set_id);

CREATE INDEX ix_entity_release_revision
    ON metadata.entity_release (revision_id);

CREATE INDEX ix_entity_release_audit_event
    ON metadata.entity_release (audit_event_id)
    WHERE audit_event_id IS NOT NULL;
