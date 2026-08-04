CREATE TABLE master.warehouse (
    id                        uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                         NOT NULL,
    code                      text                         NOT NULL,
    name                      text                         NOT NULL,
    site_id                   uuid                         NOT NULL,
    description               text,
    warehouse_type            text                         NOT NULL DEFAULT 'finished_goods',
    manager_id                uuid,
    is_negative_stock_allowed boolean                      NOT NULL DEFAULT false,
    metadata                  jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                    master.organization_status_d NOT NULL DEFAULT 'draft',
    is_active                 boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at         timestamptz,
    status_changed_by         uuid,
    created_at                timestamptz                  NOT NULL DEFAULT now(),
    created_by                uuid                         NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,
    CONSTRAINT warehouse_pkey PRIMARY KEY (id),
    CONSTRAINT warehouse_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT warehouse_site_id_uq UNIQUE (tenant_id, site_id, id),
    CONSTRAINT warehouse_site_code_uq UNIQUE (tenant_id, site_id, code),
    CONSTRAINT warehouse_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT warehouse_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT warehouse_description_chk CHECK (description IS NULL OR length(description) <= 4000),
    CONSTRAINT warehouse_type_chk CHECK (warehouse_type ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT warehouse_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT warehouse_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT warehouse_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.warehouse IS
  'Tenant inventory storage location within one immutable site. Company identity and address are inherited from master.site.';
COMMENT ON COLUMN master.warehouse.is_negative_stock_allowed IS
  'Warehouse-level operational exception. Item/category inventory policy may impose a stricter prohibition.';
