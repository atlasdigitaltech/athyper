ALTER TABLE snapshot.compiled_artifact
    ADD CONSTRAINT compiled_artifact_source_fk
    FOREIGN KEY (tenant_id, source_snapshot_id)
    REFERENCES snapshot.entity_snapshot_identity (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE snapshot.compiled_artifact
    ADD CONSTRAINT compiled_artifact_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
