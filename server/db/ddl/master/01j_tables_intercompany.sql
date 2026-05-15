-- ============================================================================
-- master/01j_tables_intercompany.sql
-- Concept: Intercompany trading control layer
-- Depends on: 01b_tables_finance.sql (company_code)
--             01h_tables_business_partner.sql (company_code_supplier_profile,
--                                              company_code_customer_profile)
--
-- Design rule:
--   legal_entity_business_partner_link = identity bridge (WHO is this LE as a BP?)
--   intercompany_trading_pair          = operational control (WHICH CCs can trade,
--                                        through WHICH profiles, with WHAT rules?)
--   intercompany_agreement             = commercial/TP agreement (WHAT price/markup?)
--
-- Tables:
--   §IC1  master.intercompany_trading_pair  — directional IC route per CC pair
--
-- FKs       → 03_constraints.sql
-- Triggers  → 06_triggers.sql
-- RLS       → 08_rls.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.intercompany_trading_pair (
    id                               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                        uuid        NOT NULL,

    -- Directional pair: source BUYS FROM counterparty
    source_company_code_id           uuid        NOT NULL,
    counterparty_company_code_id     uuid        NOT NULL,

    -- Resolved profiles
    -- counterparty_supplier_profile_id = company_code_supplier_profile(source_cc, sup-for-counterparty)
    --   i.e. the AP supplier record that the source company code uses for the counterparty
    counterparty_supplier_profile_id uuid,
    -- mirror_customer_profile_id = company_code_customer_profile(counterparty_cc, cust-for-source)
    --   i.e. the AR customer record that the counterparty company code uses for the source
    mirror_customer_profile_id       uuid,

    -- Agreement requirement
    requires_agreement               boolean     NOT NULL DEFAULT true,

    -- Mirror / automation flags
    auto_create_mirror_transaction   boolean     NOT NULL DEFAULT false,
    auto_create_mirror_invoice       boolean     NOT NULL DEFAULT false,

    -- Settlement
    settlement_mode                  text        NOT NULL DEFAULT 'open_item',
        -- 'open_item' — both AP and AR stay open until matched
        -- 'netting'   — net position cleared via IC clearing account
        -- 'cash'      — physical cash settlement
        -- 'none'      — memo only; no settlement expected

    -- Validity window (NULL = always valid)
    valid_from                       date,
    valid_until                      date,

    -- Lifecycle
    status                           text        NOT NULL DEFAULT 'active',
    is_active                        boolean     GENERATED ALWAYS AS (status = 'active') STORED,

    notes                            text,

    -- Audit
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid        NOT NULL,
    updated_at   timestamptz,
    updated_by   uuid,

    CONSTRAINT ictp_pkey                    PRIMARY KEY (id),
    CONSTRAINT ictp_tenant_id_uq            UNIQUE (tenant_id, id),
    -- One row per directed pair (source → counterparty); reverse direction is a separate row.
    CONSTRAINT ictp_direction_uq            UNIQUE (tenant_id, source_company_code_id, counterparty_company_code_id),
    CONSTRAINT ictp_no_self_trade           CHECK (source_company_code_id IS DISTINCT FROM counterparty_company_code_id),
    CONSTRAINT ictp_settlement_mode_chk     CHECK (settlement_mode IN (
                                                'open_item', 'netting', 'cash', 'none')),
    CONSTRAINT ictp_status_chk              CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT ictp_valid_order_chk         CHECK (valid_until IS NULL
                                                OR valid_from  IS NULL
                                                OR valid_until >= valid_from)
);

-- Drop constraint carried over from a prior schema version.
-- trg_set_updated_at() overwrites updated_by with NULL in seed context;
-- the paired audit_pair_chk is therefore unenforceable without app context.
ALTER TABLE IF EXISTS master.intercompany_trading_pair
    DROP CONSTRAINT IF EXISTS ictp_audit_pair_chk;

CREATE INDEX IF NOT EXISTS ictp_source_idx
    ON master.intercompany_trading_pair (tenant_id, source_company_code_id);
CREATE INDEX IF NOT EXISTS ictp_counterparty_idx
    ON master.intercompany_trading_pair (tenant_id, counterparty_company_code_id);
CREATE INDEX IF NOT EXISTS ictp_active_pidx
    ON master.intercompany_trading_pair (tenant_id, source_company_code_id, counterparty_company_code_id)
    WHERE is_active = true;

COMMENT ON TABLE master.intercompany_trading_pair IS
    'ARCHETYPE=B;SCOPE=T. Operational intercompany trading route between two company codes. '
    'One row per directed pair: source_company_code buys from counterparty_company_code. '
    'The reverse trade direction requires a separate row. '
    'Resolves: which supplier profile does the source use for the counterparty? '
    'Which customer profile does the counterparty use for the source (mirror)? '
    'Commercial pricing and TP method live in document.intercompany_agreement, '
    'linked at transaction time by source_cc + counterparty_cc + date lookup.';
COMMENT ON COLUMN master.intercompany_trading_pair.source_company_code_id IS
    'The BUYING company code — the one posting the AP invoice / PO.';
COMMENT ON COLUMN master.intercompany_trading_pair.counterparty_company_code_id IS
    'The SELLING company code — the one whose BP appears as a supplier.';
COMMENT ON COLUMN master.intercompany_trading_pair.counterparty_supplier_profile_id IS
    'company_code_supplier_profile(source_cc, supplier-for-counterparty). '
    'NULL until the profile is created; required before AP invoices can post.';
COMMENT ON COLUMN master.intercompany_trading_pair.mirror_customer_profile_id IS
    'company_code_customer_profile(counterparty_cc, customer-for-source). '
    'NULL if auto_create_mirror_invoice = false or profile not yet created.';
COMMENT ON COLUMN master.intercompany_trading_pair.settlement_mode IS
    'open_item | netting | cash | none. '
    'open_item: both AP and AR remain open until explicitly matched. '
    'netting: net balance cleared via IC clearing account on settlement run. '
    'cash: physical bank transfer required. none: memo entry only.';
COMMENT ON COLUMN master.intercompany_trading_pair.requires_agreement IS
    'When true, an active document.intercompany_agreement must exist for the '
    '(source_cc, counterparty_cc, doc_date) before the AP invoice can be posted.';
