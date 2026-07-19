-- ============================================================================
-- Stage 2: canonical posting-role vocabulary and company/book account maps
-- Depends on: control.lookup_domain/value, master finance tables
-- ============================================================================

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, metadata, status, created_by)
SELECT 'finance.posting_role', 'Finance posting role',
       'Canonical role vocabulary used by accounting, tax, payments, banking, assets and inventory.',
       'control', true, '{"canonical":true,"version":1}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain WHERE code = 'finance.posting_role'
);

CREATE TABLE IF NOT EXISTS control.posting_role_alias (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid,
    alias_code            text        NOT NULL,
    canonical_role_code   text        NOT NULL,
    source_domain_code    text,
    description           text,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'active',
    is_active             boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT posting_role_alias_pkey PRIMARY KEY (id),
    CONSTRAINT posting_role_alias_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT posting_role_alias_code_chk CHECK (alias_code ~ '^[a-z][a-z0-9_.]*$'),
    CONSTRAINT posting_role_alias_canonical_chk CHECK (canonical_role_code ~ '^[a-z][a-z0-9_.]*$'),
    CONSTRAINT posting_role_alias_status_chk CHECK (status IN ('active','deprecated'))
);

COMMENT ON TABLE control.posting_role_alias IS
    'ARCHETYPE=B;SCOPE=G. Compatibility aliases from legacy or tenant role codes to finance.posting_role codes.';

CREATE TABLE IF NOT EXISTS control.posting_role_account_map (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    company_code_id       uuid        NOT NULL,
    ledger_book_id        uuid        NOT NULL,
    posting_role_code     text        NOT NULL,
    gl_account_id         uuid        NOT NULL,
    effective_from        date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to          date,
    priority              smallint    NOT NULL DEFAULT 100,
    version_no            integer     NOT NULL DEFAULT 1,
    supersedes_id         uuid,
    description           text,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                text        NOT NULL DEFAULT 'active',
    is_active             boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT posting_role_account_map_pkey PRIMARY KEY (id),
    CONSTRAINT posting_role_account_map_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT posting_role_account_map_role_chk CHECK (posting_role_code ~ '^[a-z][a-z0-9_.]*$'),
    CONSTRAINT posting_role_account_map_dates_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT posting_role_account_map_priority_chk CHECK (priority BETWEEN 0 AND 1000),
    CONSTRAINT posting_role_account_map_version_chk CHECK (version_no > 0),
    CONSTRAINT posting_role_account_map_status_chk CHECK (status IN ('active','inactive','superseded'))
);

ALTER TABLE control.posting_role_account_map
    ADD COLUMN IF NOT EXISTS version_no integer NOT NULL DEFAULT 1;
ALTER TABLE control.posting_role_account_map
    ADD COLUMN IF NOT EXISTS supersedes_id uuid;

COMMENT ON TABLE control.posting_role_account_map IS
    'ARCHETYPE=B;SCOPE=T. Effective-dated posting-role to GL-account assignment per company and ledger book. '
    'Higher priority wins; equal-priority active ranges may not overlap.';

-- Migrate the legacy payment vocabulary when this DDL is applied to an existing
-- database. Fresh builds receive the richer canonical seed in phase 2.
INSERT INTO control.lookup_value
    (tenant_id, code, name, domain_code, description, category, sort_order,
     is_system, metadata, status, created_by)
SELECT lv.tenant_id, lower(lv.code), lv.name, 'finance.posting_role', lv.description,
       COALESCE(lv.category, 'payments'), lv.sort_order, lv.is_system,
       lv.metadata || jsonb_build_object(
           'migrated_from_domain', lv.domain_code,
           'normal_balance', COALESCE(lv.metadata->>'normal_balance', 'either'),
           'mandatory_for_readiness', COALESCE((lv.metadata->>'mandatory_for_readiness')::boolean, false)
       ),
       lv.status, lv.created_by
  FROM control.lookup_value lv
 WHERE lv.domain_code = 'control.payment_settlement_posting_role'
   AND NOT EXISTS (
       SELECT 1 FROM control.lookup_value existing
        WHERE existing.domain_code = 'finance.posting_role'
          AND existing.code = lower(lv.code)
          AND existing.tenant_id IS NOT DISTINCT FROM lv.tenant_id
   );

INSERT INTO control.posting_role_alias
    (tenant_id, alias_code, canonical_role_code, source_domain_code, description, metadata, status, created_by)
SELECT lv.tenant_id, lower(lv.code), lower(lv.code), lv.domain_code,
       'Compatibility alias for the legacy payment-settlement posting-role domain.',
       '{"compatibility":true}'::jsonb, 'active', lv.created_by
  FROM control.lookup_value lv
 WHERE lv.domain_code = 'control.payment_settlement_posting_role'
   AND NOT EXISTS (
       SELECT 1 FROM control.posting_role_alias a
        WHERE a.tenant_id IS NOT DISTINCT FROM lv.tenant_id
          AND a.alias_code = lower(lv.code)
          AND a.source_domain_code = lv.domain_code
   );

-- Discover role codes already carried by accounting-profile, settlement,
-- supplier-override and asset policy rows. This makes upgrades complete even
-- when a tenant introduced a role before the canonical catalog existed.
WITH discovered AS (
    SELECT t.tenant_id, lower(btrim(t.account_lookup_key)) AS code,
           'accounting_profiles'::text AS category, t.created_by
      FROM control.acct_profile_entry_template t
     WHERE upper(t.account_source) = 'POSTING_ROLE' AND t.account_lookup_key IS NOT NULL
    UNION ALL
    SELECT r.tenant_id, lower(btrim(x.code)), 'payments', r.created_by
      FROM control.payment_settlement_rule r
      CROSS JOIN LATERAL unnest(ARRAY[
        r.clearing_posting_role_code, r.settlement_posting_role_code,
        r.bank_fee_posting_role_code, r.discount_posting_role_code,
        r.fx_gain_posting_role_code, r.fx_loss_posting_role_code,
        r.chargeback_posting_role_code, r.suspense_posting_role_code
      ]) x(code)
     WHERE x.code IS NOT NULL
    UNION ALL
    SELECT p.tenant_id, lower(btrim(x.code)), 'fixed_assets', p.created_by
      FROM control.asset_class_book_policy p
      CROSS JOIN LATERAL unnest(ARRAY[
        p.acquisition_posting_role_code, p.accum_depr_posting_role_code,
        p.depr_expense_posting_role_code, p.gain_loss_posting_role_code,
        p.impairment_expense_posting_role_code, p.impairment_reserve_posting_role_code,
        p.revaluation_surplus_posting_role_code, p.revaluation_loss_posting_role_code,
        p.cwip_posting_role_code
      ]) x(code)
     WHERE x.code IS NOT NULL
    UNION ALL
    SELECT p.tenant_id, lower(btrim(x.code)), 'fixed_assets', p.created_by
      FROM control.asset_class_book_policy_template p
      CROSS JOIN LATERAL unnest(ARRAY[
        p.acquisition_posting_role_code, p.accum_depr_posting_role_code,
        p.depr_expense_posting_role_code, p.gain_loss_posting_role_code,
        p.impairment_expense_posting_role_code, p.impairment_reserve_posting_role_code,
        p.revaluation_surplus_posting_role_code, p.revaluation_loss_posting_role_code,
        p.cwip_posting_role_code
      ]) x(code)
     WHERE x.code IS NOT NULL
    UNION ALL
    SELECT s.tenant_id, lower(btrim(s.posting_role_code)), 'payables', s.created_by
      FROM control.supplier_posting_override s
), roles AS (
    SELECT tenant_id, code, min(category) AS category,
           (array_agg(created_by ORDER BY created_by))[1] AS created_by
      FROM discovered
     WHERE code ~ '^[a-z][a-z0-9_.]*$'
     GROUP BY tenant_id, code
)
INSERT INTO control.lookup_value
    (tenant_id, code, name, domain_code, description, category, sort_order,
     is_system, metadata, status, created_by)
SELECT r.tenant_id, r.code, initcap(replace(r.code, '_', ' ')),
       'finance.posting_role', 'Discovered from existing finance configuration.',
       r.category, 900, r.tenant_id IS NULL,
       jsonb_build_object('discovered', true, 'normal_balance', 'either',
                          'mandatory_for_readiness', false),
       'active', r.created_by
  FROM roles r
 WHERE NOT EXISTS (
     SELECT 1 FROM control.lookup_value existing
      WHERE existing.domain_code = 'finance.posting_role'
        AND existing.code = r.code
        AND (existing.tenant_id IS NOT DISTINCT FROM r.tenant_id OR existing.tenant_id IS NULL)
 );

-- Remove only generic rows created by the discovery migration when a richer
-- global canonical definition exists. Tenant-only extension codes are kept.
DELETE FROM control.lookup_value tenant_role
 WHERE tenant_role.domain_code = 'finance.posting_role'
   AND tenant_role.tenant_id IS NOT NULL
   AND COALESCE((tenant_role.metadata->>'discovered')::boolean, false)
   AND EXISTS (
       SELECT 1 FROM control.lookup_value global_role
        WHERE global_role.domain_code = tenant_role.domain_code
          AND global_role.code = tenant_role.code
          AND global_role.tenant_id IS NULL
   );
