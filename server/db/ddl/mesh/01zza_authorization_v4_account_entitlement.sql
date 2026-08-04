CREATE TABLE IF NOT EXISTS mesh.account_entitlement (
    id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
    account_id          uuid        NOT NULL,
    plane_code          text        NOT NULL DEFAULT 'mesh',
    product_code        text        NOT NULL,
    capability_code     text,
    status              text        NOT NULL DEFAULT 'scheduled',
    effective_from      timestamptz NOT NULL DEFAULT now(),
    effective_until     timestamptz,
    source_type         text        NOT NULL,
    source_ref          text        NOT NULL,
    provenance          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          text        NOT NULL DEFAULT 'system',
    updated_at          timestamptz,
    updated_by          text,

    CONSTRAINT mesh_account_entitlement_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_account_entitlement_account_plane_id_uq
        UNIQUE (account_id, plane_code, id),
    CONSTRAINT mesh_account_entitlement_target_uq
        UNIQUE NULLS NOT DISTINCT (
            account_id, plane_code, product_code, capability_code
        ),
    CONSTRAINT mesh_account_entitlement_plane_chk
        CHECK (plane_code = 'mesh'),
    CONSTRAINT mesh_account_entitlement_product_chk
        CHECK (product_code ~ '^[a-z][a-z0-9_.-]{1,127}$'),
    CONSTRAINT mesh_account_entitlement_capability_chk
        CHECK (
            capability_code IS NULL
            OR capability_code ~ '^[a-z][a-z0-9_.-]{1,127}$'
        ),
    CONSTRAINT mesh_account_entitlement_status_chk
        CHECK (status IN (
            'scheduled', 'active', 'suspended', 'expired', 'retired'
        )),
    CONSTRAINT mesh_account_entitlement_effective_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT mesh_account_entitlement_source_chk
        CHECK (source_type IN (
            'seed', 'contract', 'purchase', 'migration', 'integration'
        )),
    CONSTRAINT mesh_account_entitlement_ref_chk
        CHECK (btrim(source_ref) <> ''),
    CONSTRAINT mesh_account_entitlement_provenance_chk
        CHECK (jsonb_typeof(provenance) = 'object'),
    CONSTRAINT mesh_account_entitlement_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

ALTER TABLE mesh.account_entitlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesh.account_entitlement FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mesh.account_entitlement FROM PUBLIC;
