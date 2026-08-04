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
