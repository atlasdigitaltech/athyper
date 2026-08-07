-- Unified named-contact foundation for Mesh network accounts and Neon parties.

CREATE TABLE master.contact_person (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    owner_type_id     uuid        NOT NULL,
    owner_id          uuid        NOT NULL,
    contact_name      text        NOT NULL,
    business_title    text,
    department_name   text,
    is_primary        boolean     NOT NULL DEFAULT false,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status            text        NOT NULL DEFAULT 'active',
    is_active         boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT contact_person_pkey PRIMARY KEY (id),
    CONSTRAINT contact_person_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT contact_person_name_chk
        CHECK (btrim(contact_name) <> '' AND length(contact_name) <= 240),
    CONSTRAINT contact_person_title_chk
        CHECK (business_title IS NULL OR (
            btrim(business_title) <> '' AND length(business_title) <= 160
        )),
    CONSTRAINT contact_person_department_chk
        CHECK (department_name IS NULL OR (
            btrim(department_name) <> '' AND length(department_name) <= 160
        )),
    CONSTRAINT contact_person_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
    CONSTRAINT contact_person_status_chk
        CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT contact_person_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT contact_person_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.contact_person IS
  'Owner-scoped named business contact. It is not an HR person, employee, or login identity.';

CREATE TABLE master.contact_person_role (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    contact_person_id uuid        NOT NULL,
    role_code         text        NOT NULL,
    effective_from    date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until   date,
    is_primary        boolean     NOT NULL DEFAULT false,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT contact_person_role_pkey PRIMARY KEY (id),
    CONSTRAINT contact_person_role_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT contact_person_role_code_fmt_chk
        CHECK (role_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT contact_person_role_range_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT contact_person_role_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 4096),
    CONSTRAINT contact_person_role_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.contact_person_role IS
  'Temporal contact-to-role assignment. role_code resolves through the tenant-extensible master.contact_role lookup domain.';
