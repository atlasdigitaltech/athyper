CREATE INDEX IF NOT EXISTS atlas_knowledge_source_active_idx
    ON master.atlas_knowledge_source (tenant_id, id)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS atlas_knowledge_revision_ready_idx
    ON master.atlas_knowledge_revision (tenant_id, source_id, id)
    WHERE status = 'ready';
CREATE INDEX IF NOT EXISTS atlas_knowledge_chunk_ready_idx
    ON master.atlas_knowledge_chunk (tenant_id, revision_id, ordinal)
    WHERE index_status = 'ready';
