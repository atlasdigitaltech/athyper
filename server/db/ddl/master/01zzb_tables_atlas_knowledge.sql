-- Atlas tenant RAG metadata. These tables never make a vector index the
-- authority for content: chunks retain an immutable source/revision reference
-- and checksum, while canonical bytes remain with the domain/content service.

CREATE TABLE IF NOT EXISTS master.atlas_knowledge_source (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    source_kind         text        NOT NULL,
    source_id           text        NOT NULL,
    entity_code         text,
    permission_code     text        NOT NULL,
    status              text        NOT NULL DEFAULT 'active',
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT atlas_knowledge_source_pkey PRIMARY KEY (id),
    CONSTRAINT atlas_knowledge_source_tenant_uq UNIQUE (tenant_id, source_kind, source_id),
    CONSTRAINT atlas_knowledge_source_kind_chk CHECK (source_kind IN ('record', 'attachment', 'content')),
    CONSTRAINT atlas_knowledge_source_status_chk CHECK (status IN ('active', 'disabled', 'deleted')),
    CONSTRAINT atlas_knowledge_source_id_chk CHECK (btrim(source_id) <> ''),
    CONSTRAINT atlas_knowledge_source_permission_chk CHECK (btrim(permission_code) <> '')
);

CREATE TABLE IF NOT EXISTS master.atlas_knowledge_revision (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    source_id           uuid        NOT NULL,
    source_version_id   text        NOT NULL,
    checksum            text        NOT NULL,
    status              text        NOT NULL DEFAULT 'pending',
    indexed_at          timestamptz,
    superseded_at       timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT atlas_knowledge_revision_pkey PRIMARY KEY (id),
    CONSTRAINT atlas_knowledge_revision_source_version_uq UNIQUE (tenant_id, source_id, source_version_id),
    CONSTRAINT atlas_knowledge_revision_status_chk CHECK (status IN ('pending', 'indexing', 'ready', 'failed', 'superseded', 'deleted')),
    CONSTRAINT atlas_knowledge_revision_version_chk CHECK (btrim(source_version_id) <> ''),
    CONSTRAINT atlas_knowledge_revision_checksum_chk CHECK (btrim(checksum) <> ''),
    CONSTRAINT atlas_knowledge_revision_source_fk FOREIGN KEY (source_id) REFERENCES master.atlas_knowledge_source(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS master.atlas_knowledge_chunk (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    revision_id         uuid        NOT NULL,
    ordinal             integer     NOT NULL,
    character_start     integer     NOT NULL,
    character_end       integer     NOT NULL,
    checksum            text        NOT NULL,
    embedding_model     text,
    index_status        text        NOT NULL DEFAULT 'pending',
    index_reference     text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT atlas_knowledge_chunk_pkey PRIMARY KEY (id),
    CONSTRAINT atlas_knowledge_chunk_ordinal_uq UNIQUE (tenant_id, revision_id, ordinal),
    CONSTRAINT atlas_knowledge_chunk_range_chk CHECK (character_start >= 0 AND character_end > character_start),
    CONSTRAINT atlas_knowledge_chunk_checksum_chk CHECK (btrim(checksum) <> ''),
    CONSTRAINT atlas_knowledge_chunk_status_chk CHECK (index_status IN ('pending', 'indexing', 'ready', 'failed', 'deleted')),
    CONSTRAINT atlas_knowledge_chunk_revision_fk FOREIGN KEY (revision_id) REFERENCES master.atlas_knowledge_revision(id) ON DELETE CASCADE
);

COMMENT ON TABLE master.atlas_knowledge_source IS
    'ARCHETYPE=C;SCOPE=T. Tenant-controlled Atlas retrieval source with required effective read permission.';
COMMENT ON TABLE master.atlas_knowledge_revision IS
    'ARCHETYPE=C;SCOPE=T. Immutable source revision and checksum used to reject stale retrieval candidates.';
COMMENT ON TABLE master.atlas_knowledge_chunk IS
    'ARCHETYPE=C;SCOPE=T. Chunk locator and index state; it intentionally stores no customer text.';
