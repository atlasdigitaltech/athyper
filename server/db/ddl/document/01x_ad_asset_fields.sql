-- ============================================================================
-- document/01x_ad_asset_fields.sql
-- Concept: AD asset frozen fields (P3 v1.2)
-- Depends on: 01b_tables_journal.sql (AD existing is_capex + asset_class_id)
-- Spec: docs/specs/purchase_invoice_field_design.md §3.4
--
-- AD already has:
--   • is_capex          boolean NOT NULL DEFAULT false   (line 429)
--   • asset_class_id    uuid                              (line 430)
--
-- P3 adds the missing frozen snapshots that the posting service writes during
-- the Stage 3 final UPDATE:
--   • asset_posting_target    enum: cwip_clearing | fixed_asset | class_clearing | expense | NULL
--   • target_asset_id         FK → master.asset (NULL for class_pending / expense / non-asset splits)
-- ============================================================================


-- =============================================================================
-- §P3.6  AD asset_posting_target + target_asset_id
-- =============================================================================

ALTER TABLE document.accounting_distribution
    ADD COLUMN IF NOT EXISTS asset_posting_target text,
    ADD COLUMN IF NOT EXISTS target_asset_id      uuid;

COMMENT ON COLUMN document.accounting_distribution.asset_posting_target IS
    'Frozen at Stage 3 posting. Enum: cwip_clearing | fixed_asset | class_clearing | expense | NULL. '
    'Routes the GL hit per asset_class_book_policy:'
    '  cwip_clearing  → cwip_posting_role_code'
    '  fixed_asset    → acquisition_posting_role_code'
    '  class_clearing → class_clearing_posting_role_code (added in 01z_asset_class_book_policy_clearing_roles.sql)'
    '  expense        → expense_low_value_posting_role_code'
    '  NULL           → non-asset split (the bulk)';

COMMENT ON COLUMN document.accounting_distribution.target_asset_id IS
    'Frozen snapshot from PIL.target_asset_id at Stage 3 posting. NULL when '
    'asset_posting_target IN (''class_clearing'',''expense'') or for non-asset splits.';


-- =============================================================================
-- §P3.7  Foreign key + CHECK
-- =============================================================================

DO $$
BEGIN
    ALTER TABLE document.accounting_distribution
        ADD CONSTRAINT ad_target_asset_fk
        FOREIGN KEY (tenant_id, target_asset_id)
        REFERENCES master.asset (tenant_id, id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.accounting_distribution
        ADD CONSTRAINT ad_asset_posting_target_chk CHECK (
            asset_posting_target IS NULL
            OR asset_posting_target IN ('cwip_clearing','fixed_asset','class_clearing','expense')
        ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    -- is_capex implies an asset target OR class_clearing routing
    ALTER TABLE document.accounting_distribution
        ADD CONSTRAINT ad_asset_capex_target_chk CHECK (
            is_capex = false
            OR target_asset_id IS NOT NULL
            OR asset_posting_target = 'class_clearing'
        ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;


-- =============================================================================
-- §P3.8  Indexes for capex reporting & class-pending clearing audit
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_ad_capex_target
    ON document.accounting_distribution (tenant_id, target_asset_id)
    WHERE is_capex = true;

CREATE INDEX IF NOT EXISTS ix_ad_class_clearing
    ON document.accounting_distribution (tenant_id, asset_class_id, asset_posting_target)
    WHERE asset_posting_target = 'class_clearing';


-- Operator notes:
--   After backfill (P3 only adds nullable columns), VALIDATE the new CHECKs:
--     ALTER TABLE document.accounting_distribution VALIDATE CONSTRAINT ad_asset_posting_target_chk;
--     ALTER TABLE document.accounting_distribution VALIDATE CONSTRAINT ad_asset_capex_target_chk;
--   Validation can fail if older AD rows have is_capex=true with neither
--   target_asset_id nor asset_posting_target='class_clearing' set; run
--   server/scripts/verify-ad-asset-frozen-fields.ts (P3 follow-on) before VALIDATE.


-- =============================================================================
-- End of 01x_ad_asset_fields.sql
-- =============================================================================
