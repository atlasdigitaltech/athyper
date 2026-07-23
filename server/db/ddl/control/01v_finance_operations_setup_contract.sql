-- Finance Setup Phase 2, Stage A: governed policy and secure-interface contracts.

CREATE TABLE IF NOT EXISTS control.fx_policy (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    company_code_id                     uuid,
    ledger_book_id                      uuid,
    transaction_context                 text        NOT NULL DEFAULT 'general',
    effective_from                      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                        date,
    priority                            smallint    NOT NULL DEFAULT 100,
    default_rate_type                   text        NOT NULL DEFAULT 'SPOT',
    revaluation_rate_type               text        NOT NULL DEFAULT 'PERIOD_END',
    pivot_currency_code                 character(3),
    allow_inverse                       boolean     NOT NULL DEFAULT true,
    allow_triangulation                 boolean     NOT NULL DEFAULT false,
    preferred_sources                   jsonb       NOT NULL DEFAULT '[]'::jsonb,
    maximum_rate_age_days               integer,
    missing_rate_behavior               text        NOT NULL DEFAULT 'block',
    manual_override_allowed             boolean     NOT NULL DEFAULT false,
    manual_override_approval_required   boolean     NOT NULL DEFAULT false,
    auto_reverse_revaluation            boolean     NOT NULL DEFAULT true,
    metadata                            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                              text        NOT NULL DEFAULT 'draft',
    is_active                           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    version_no                          integer     NOT NULL DEFAULT 1,
    supersedes_id                       uuid,
    status_changed_at                   timestamptz,
    status_changed_by                   uuid,
    created_at                          timestamptz NOT NULL DEFAULT now(),
    created_by                          uuid        NOT NULL,
    updated_at                          timestamptz,
    updated_by                          uuid,

    CONSTRAINT fx_policy_pkey PRIMARY KEY (id),
    CONSTRAINT fx_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT fx_policy_context_chk CHECK (btrim(transaction_context) <> ''),
    CONSTRAINT fx_policy_scope_chk CHECK (ledger_book_id IS NULL OR company_code_id IS NOT NULL),
    CONSTRAINT fx_policy_dates_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT fx_policy_priority_chk CHECK (priority BETWEEN 0 AND 1000),
    CONSTRAINT fx_policy_rate_types_chk CHECK (
        default_rate_type IN ('SPOT','PERIOD_AVG','PERIOD_END','BUDGET','CONTRACTED','HISTORICAL')
        AND revaluation_rate_type IN ('SPOT','PERIOD_AVG','PERIOD_END','BUDGET','CONTRACTED','HISTORICAL')
    ),
    CONSTRAINT fx_policy_triangulation_chk CHECK (NOT allow_triangulation OR pivot_currency_code IS NOT NULL),
    CONSTRAINT fx_policy_sources_chk CHECK (jsonb_typeof(preferred_sources) = 'array'),
    CONSTRAINT fx_policy_age_chk CHECK (maximum_rate_age_days IS NULL OR maximum_rate_age_days >= 0),
    CONSTRAINT fx_policy_missing_behavior_chk CHECK (missing_rate_behavior IN ('block','manual_with_approval','fallback')),
    CONSTRAINT fx_policy_manual_approval_chk CHECK (
        NOT manual_override_approval_required OR manual_override_allowed
    ),
    CONSTRAINT fx_policy_status_chk CHECK (status IN ('draft','active','inactive','superseded')),
    CONSTRAINT fx_policy_version_chk CHECK (version_no > 0),
    CONSTRAINT fx_policy_not_self_superseding_chk CHECK (supersedes_id IS NULL OR supersedes_id <> id),
    CONSTRAINT fx_policy_no_equal_priority_overlap EXCLUDE USING gist (
        tenant_id WITH =,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(ledger_book_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        transaction_context WITH =,
        priority WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
    ) WHERE (status = 'active')
);

COMMENT ON TABLE control.fx_policy IS
    'ARCHETYPE=B;SCOPE=T. Effective-dated FX resolution policy. NULL Company and Book is Tenant scope; '
    'Company scope overrides Tenant; Company+Book overrides Company. Triangulation is disabled unless an explicit pivot is configured.';
COMMENT ON COLUMN control.fx_policy.preferred_sources IS
    'Ordered array of source codes. This is routing policy, not provider credential storage.';

-- CREATE TABLE installs this constraint for a fresh database. The catalog
-- guard below upgrades databases where fx_policy existed before Stage A
-- without trying to recreate the constraint-owned GiST index.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'control.fx_policy'::regclass
           AND conname = 'fx_policy_no_equal_priority_overlap'
    ) THEN
        ALTER TABLE control.fx_policy ADD CONSTRAINT fx_policy_no_equal_priority_overlap
            EXCLUDE USING gist (
                tenant_id WITH =,
                COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
                COALESCE(ledger_book_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
                transaction_context WITH =,
                priority WITH =,
                daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
            ) WHERE (status = 'active');
    END IF;
END $$;

-- Tax rounding is owned by the Tax Group aggregate. A future Company override
-- requires a separate statutory contract and must not be hidden in metadata.
ALTER TABLE control.tax_group
    ADD COLUMN IF NOT EXISTS rounding_rule_id uuid;

COMMENT ON COLUMN control.tax_group.rounding_rule_id IS
    'Tax rounding policy selected by the Tax Group aggregate. NULL is not a runtime fallback; readiness reports unresolved rounding.';

-- Interface profiles carry only non-secret configuration. Credentials live in
-- the platform secret provider and are represented here by an opaque reference.
ALTER TABLE control.bank_interface_profile
    ADD COLUMN IF NOT EXISTS credential_provider text,
    ADD COLUMN IF NOT EXISTS credential_reference text,
    ADD COLUMN IF NOT EXISTS credential_version text,
    ADD COLUMN IF NOT EXISTS credential_status text NOT NULL DEFAULT 'not_configured',
    ADD COLUMN IF NOT EXISTS credential_last_validated_at timestamptz,
    ADD COLUMN IF NOT EXISTS credential_rotated_at timestamptz;

DO $$ BEGIN
    ALTER TABLE control.bank_interface_profile
        ADD CONSTRAINT bip_credential_pair_chk CHECK (
            (credential_provider IS NULL) = (credential_reference IS NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.bank_interface_profile
        ADD CONSTRAINT bip_credential_status_chk CHECK (credential_status IN (
            'not_configured','configured','validation_failed','rotation_required','revoked'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.bank_interface_profile
        ADD CONSTRAINT bip_credential_configured_chk CHECK (
            credential_status = 'not_configured' OR credential_reference IS NOT NULL
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN control.bank_interface_profile.config IS
    'Non-secret provider routing and capability configuration only. Secret-shaped keys are rejected by a database trigger.';
COMMENT ON COLUMN control.bank_interface_profile.credential_reference IS
    'Opaque reference into the platform secret provider. The referenced secret is never returned by Finance or generic Entity APIs.';
COMMENT ON COLUMN control.bank_interface_profile.credential_status IS
    'Read-only credential health projection maintained by governed test/rotate commands.';
