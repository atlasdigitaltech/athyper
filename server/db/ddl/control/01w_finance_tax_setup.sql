-- Finance Setup Phase 2, Stage C: stable Tax Group identity with effective versions.

CREATE TABLE IF NOT EXISTS control.tax_group_version (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    tax_group_id            uuid        NOT NULL,
    version_no              integer     NOT NULL,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    is_compound             boolean     NOT NULL DEFAULT false,
    rounding_rule_id        uuid        NOT NULL,
    description             text,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  text        NOT NULL DEFAULT 'draft',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    supersedes_id           uuid,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tgv_pkey PRIMARY KEY (id),
    CONSTRAINT tgv_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT tgv_group_version_uq UNIQUE (tenant_id, tax_group_id, version_no),
    CONSTRAINT tgv_version_chk CHECK (version_no > 0),
    CONSTRAINT tgv_effective_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT tgv_status_chk CHECK (status IN ('draft','active','inactive','superseded')),
    CONSTRAINT tgv_not_self_superseding_chk CHECK (supersedes_id IS NULL OR supersedes_id <> id),
    CONSTRAINT tgv_active_overlap_excl EXCLUDE USING gist (
        tenant_id WITH =,
        tax_group_id WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
    ) WHERE (status = 'active')
);

ALTER TABLE control.tax_group_component
    ADD COLUMN IF NOT EXISTS tax_group_version_id uuid;

ALTER TABLE control.tax_group_component DROP CONSTRAINT IF EXISTS tgc_group_seq_uq;
ALTER TABLE control.tax_group_component DROP CONSTRAINT IF EXISTS tgc_group_rate_uq;
ALTER TABLE control.tax_group_component DROP CONSTRAINT IF EXISTS tgc_group_version_seq_uq;
ALTER TABLE control.tax_group_component DROP CONSTRAINT IF EXISTS tgc_group_version_rate_uq;

ALTER TABLE control.wht_threshold_config DROP CONSTRAINT IF EXISTS wtc_natural_uq;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='control.wht_threshold_config'::regclass AND conname='wtc_effective_overlap_excl') THEN
        ALTER TABLE control.wht_threshold_config ADD CONSTRAINT wtc_effective_overlap_excl
            EXCLUDE USING gist (
                tenant_id WITH =, jurisdiction_id WITH =, tax_type_id WITH =,
                COALESCE(section_code, '') WITH =,
                daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
            ) WHERE (is_active = true);
    END IF;
END $$;

COMMENT ON TABLE control.tax_group_version IS
    'ARCHETYPE=B;SCOPE=T. Effective Tax Group contract version. Stable tax_group IDs remain referenced by documents and resolution rules; runtime selects exactly one effective active version and its ordered components.';
COMMENT ON COLUMN control.tax_group_component.tax_group_version_id IS
    'Owning aggregate version. NULL identifies legacy components used only when no effective Tax Group Version exists.';
