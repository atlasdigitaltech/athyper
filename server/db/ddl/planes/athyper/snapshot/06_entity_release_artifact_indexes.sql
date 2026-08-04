CREATE INDEX ix_entity_release_artifact_entity
    ON snapshot.entity_release_artifact (tenant_id, entity_id, plane_key, created_at DESC);
CREATE INDEX ix_entity_release_artifact_hash
    ON snapshot.entity_release_artifact (compiled_hash);
