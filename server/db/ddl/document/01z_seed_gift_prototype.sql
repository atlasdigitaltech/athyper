-- ============================================================================
-- document/01z_seed_gift_prototype.sql
-- Concept: Neon prototype entity for ATHQ-scoped seed gifts.
-- Scope: Prototype only. Rows are operationally scoped to one company code
--        (ATHQ / Athyper Group Holdings) by trigger in 03_constraints.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.seed_gift (
    id                   uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid            NOT NULL,
    company_code_id      uuid            NOT NULL,

    gift_code            text            NOT NULL,
    title                text            NOT NULL,
    description          text,
    recipient_name       text,
    recipient_email      text,
    gift_type            text            NOT NULL DEFAULT 'prototype',
    gift_value           numeric(18,2),
    currency_code        character(3)    NOT NULL DEFAULT 'MYR',
    source_ref           text,
    source_payload       jsonb           NOT NULL DEFAULT '{}'::jsonb,
    metadata             jsonb           NOT NULL DEFAULT '{}'::jsonb,

    status               text            NOT NULL DEFAULT 'draft',
    is_active            boolean         GENERATED ALWAYS AS (
                             status IN ('draft','active')
                         ) STORED,
    status_changed_at    timestamptz,
    status_changed_by    uuid,

    created_at           timestamptz     NOT NULL DEFAULT now(),
    created_by           uuid            NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT seed_gift_pkey PRIMARY KEY (id),
    CONSTRAINT seed_gift_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT seed_gift_code_uq UNIQUE (tenant_id, company_code_id, gift_code),
    CONSTRAINT seed_gift_status_chk CHECK (status IN ('draft','active','archived')),
    CONSTRAINT seed_gift_value_nonneg_chk CHECK (gift_value IS NULL OR gift_value >= 0),
    CONSTRAINT seed_gift_source_payload_obj_chk CHECK (jsonb_typeof(source_payload) = 'object'),
    CONSTRAINT seed_gift_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE document.seed_gift IS
    'ARCHETYPE=B;SCOPE=T. Prototype Neon-only gift seed entity. Intended for '
    'Athyper Group Holdings (company_code ATHQ) live database demos with import '
    'and attachment support.';

COMMENT ON COLUMN document.seed_gift.company_code_id IS
    'Prototype scope owner. Must resolve to company_code ATHQ while the ATHQ-only '
    'guard in document.trg_seed_gift_athq_only is active.';

COMMENT ON COLUMN document.seed_gift.source_payload IS
    'Original or derived live-source payload captured during prototype import.';
