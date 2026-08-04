CREATE INDEX entity_snapshot_identity_recent_idx
    ON snapshot.entity_snapshot_identity (
        tenant_id, entity_type, entity_id, captured_at DESC
    );

CREATE INDEX entity_snapshot_identity_chain_idx
    ON snapshot.entity_snapshot_identity (
        tenant_id, entity_type, entity_id, chain_seq DESC
    );

CREATE INDEX entity_snapshot_identity_event_idx
    ON snapshot.entity_snapshot_identity (
        tenant_id, capture_kind, capture_event, captured_at DESC
    );

CREATE INDEX entity_snapshot_identity_captured_by_idx
    ON snapshot.entity_snapshot_identity (
        tenant_id, captured_by, captured_at DESC
    );

CREATE INDEX entity_snapshot_identity_previous_idx
    ON snapshot.entity_snapshot_identity (tenant_id, previous_snapshot_id)
    WHERE previous_snapshot_id IS NOT NULL;

CREATE INDEX entity_snapshot_identity_correlation_idx
    ON snapshot.entity_snapshot_identity (tenant_id, correlation_id)
    WHERE correlation_id IS NOT NULL;

CREATE INDEX entity_snapshot_identity_audit_event_idx
    ON snapshot.entity_snapshot_identity (tenant_id, audit_event_id)
    WHERE audit_event_id IS NOT NULL;

CREATE INDEX entity_snapshot_identity_retention_idx
    ON snapshot.entity_snapshot_identity (
        tenant_id, retention_class, captured_at
    );
