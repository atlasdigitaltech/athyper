CREATE TABLE snapshot.bom (
    id                 uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid              NOT NULL,
    source_bom_id      uuid              NOT NULL,
    revision_no        integer           NOT NULL,
    company_code_id    uuid              NOT NULL,
    output_item_id     uuid              NOT NULL,
    code               text              NOT NULL,
    name               text              NOT NULL,
    bom_type           master.bom_type_d NOT NULL,
    base_quantity      numeric(18,6)     NOT NULL,
    uom_code           text              NOT NULL,
    effective_from     date,
    effective_until    date,
    content_hash       text              NOT NULL,
    source_metadata    jsonb             NOT NULL DEFAULT '{}'::jsonb,
    released_at        timestamptz       NOT NULL DEFAULT now(),
    released_by        uuid              NOT NULL,
    created_at         timestamptz       NOT NULL DEFAULT now(),
    created_by         uuid              NOT NULL,

    CONSTRAINT bom_snapshot_pkey PRIMARY KEY (id),
    CONSTRAINT bom_snapshot_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bom_snapshot_source_revision_uq
        UNIQUE (tenant_id, source_bom_id, revision_no),
    CONSTRAINT bom_snapshot_source_hash_uq
        UNIQUE (tenant_id, source_bom_id, content_hash),
    CONSTRAINT bom_snapshot_revision_chk CHECK (revision_no >= 1),
    CONSTRAINT bom_snapshot_code_chk CHECK (btrim(code) <> ''),
    CONSTRAINT bom_snapshot_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT bom_snapshot_quantity_chk CHECK (base_quantity > 0),
    CONSTRAINT bom_snapshot_range_chk CHECK (
        effective_until IS NULL
        OR effective_from IS NULL
        OR effective_until >= effective_from
    ),
    CONSTRAINT bom_snapshot_hash_chk
        CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT bom_snapshot_metadata_object_chk
        CHECK (jsonb_typeof(source_metadata) = 'object'),
    CONSTRAINT bom_snapshot_release_evidence_chk
        CHECK (released_at IS NOT NULL AND released_by IS NOT NULL)
);

CREATE TABLE snapshot.bom_component (
    id                          uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid          NOT NULL,
    bom_snapshot_id             uuid          NOT NULL,
    source_bom_component_id     uuid          NOT NULL,
    component_item_id           uuid          NOT NULL,
    line_no                     integer       NOT NULL,
    quantity                    numeric(18,6) NOT NULL,
    uom_code                    text          NOT NULL,
    scrap_percent               numeric(7,4)  NOT NULL DEFAULT 0,
    issue_method                text          NOT NULL,
    is_optional                 boolean       NOT NULL DEFAULT false,
    alternate_group_code        text,
    sort_order                  integer       NOT NULL DEFAULT 0,
    source_metadata             jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz   NOT NULL DEFAULT now(),
    created_by                  uuid          NOT NULL,

    CONSTRAINT bom_component_snapshot_pkey PRIMARY KEY (id),
    CONSTRAINT bom_component_snapshot_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bom_component_snapshot_line_uq
        UNIQUE (tenant_id, bom_snapshot_id, line_no),
    CONSTRAINT bom_component_snapshot_source_uq
        UNIQUE (tenant_id, bom_snapshot_id, source_bom_component_id),
    CONSTRAINT bom_component_snapshot_line_chk CHECK (line_no >= 1),
    CONSTRAINT bom_component_snapshot_quantity_chk CHECK (quantity > 0),
    CONSTRAINT bom_component_snapshot_scrap_chk
        CHECK (scrap_percent >= 0 AND scrap_percent < 100),
    CONSTRAINT bom_component_snapshot_issue_method_chk
        CHECK (issue_method IN ('manual', 'backflush', 'preflush')),
    CONSTRAINT bom_component_snapshot_alternate_chk
        CHECK (alternate_group_code IS NULL OR btrim(alternate_group_code) <> ''),
    CONSTRAINT bom_component_snapshot_metadata_object_chk
        CHECK (jsonb_typeof(source_metadata) = 'object')
);

COMMENT ON TABLE snapshot.bom IS
  'Immutable released BOM header consumed by production orders.';

COMMENT ON TABLE snapshot.bom_component IS
  'Immutable component expansion belonging to one released BOM snapshot.';
