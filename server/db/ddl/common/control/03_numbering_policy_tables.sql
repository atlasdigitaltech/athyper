-- Identical plane-local policy contract for Neon and Mesh.
-- Athyper metadata stores only portable policy coordinates; counters are a later runtime slice.
CREATE TABLE control.numbering_policy (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid,
    policy_code       text        NOT NULL,
    policy_revision   integer     NOT NULL,
    name              text        NOT NULL,
    description       text,
    format_template   text        NOT NULL,
    sequence_width    smallint    NOT NULL DEFAULT 6,
    pad_character     character(1) NOT NULL DEFAULT '0',
    start_value       bigint      NOT NULL DEFAULT 1,
    increment_by      integer     NOT NULL DEFAULT 1,
    maximum_value     bigint,
    scope_kind        text        NOT NULL DEFAULT 'tenant',
    reset_kind        text        NOT NULL DEFAULT 'never',
    timezone_code     text,
    status            text        NOT NULL DEFAULT 'draft',
    activated_at      timestamptz,
    activated_by      uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT numbering_policy_pkey PRIMARY KEY (id),
    CONSTRAINT numbering_policy_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT numbering_policy_code_revision_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, policy_code, policy_revision),
    CONSTRAINT numbering_policy_code_chk CHECK (policy_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT numbering_policy_revision_chk CHECK (policy_revision >= 1),
    CONSTRAINT numbering_policy_name_chk CHECK (btrim(name) <> '' AND length(name) <= 256),
    CONSTRAINT numbering_policy_description_chk CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT numbering_policy_template_length_chk CHECK (length(format_template) BETWEEN 3 AND 256),
    CONSTRAINT numbering_policy_width_chk CHECK (sequence_width BETWEEN 1 AND 20),
    CONSTRAINT numbering_policy_pad_chk CHECK (pad_character !~ '[{}[:space:]]'),
    CONSTRAINT numbering_policy_start_chk CHECK (
        start_value BETWEEN 0 AND 9007199254740991 - increment_by
    ),
    CONSTRAINT numbering_policy_increment_chk CHECK (increment_by > 0),
    CONSTRAINT numbering_policy_maximum_chk CHECK (
        maximum_value IS NULL OR maximum_value BETWEEN start_value AND 9007199254740991 - increment_by
    ),
    CONSTRAINT numbering_policy_scope_chk CHECK (scope_kind IN (
        'tenant','entity','operating_organization','resource_company','ledger','network_account'
    )),
    CONSTRAINT numbering_policy_reset_chk CHECK (reset_kind IN (
        'never','calendar_year','calendar_month','calendar_day','fiscal_year'
    )),
    CONSTRAINT numbering_policy_status_chk CHECK (status IN ('draft','active','retired')),
    CONSTRAINT numbering_policy_activation_pair_chk CHECK ((activated_at IS NULL) = (activated_by IS NULL)),
    CONSTRAINT numbering_policy_activation_state_chk CHECK (
        (status = 'draft' AND activated_at IS NULL)
        OR (status IN ('active','retired') AND activated_at IS NOT NULL)
    ),
    CONSTRAINT numbering_policy_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.numbering_policy IS
  'Plane-local immutable numbering policy revision. It describes formatting and counter partitioning but stores no mutable counter value.';
COMMENT ON COLUMN control.numbering_policy.format_template IS
  'Controlled template containing exactly one {seq}; optional tokens are {yyyy}, {yy}, {mm}, {dd}, {fiscal_year}, and {scope}.';
COMMENT ON COLUMN control.numbering_policy.scope_kind IS
  'Resolver contract for the counter partition beyond tenant. The future allocation service supplies the corresponding stable scope key.';
