-- =============================================================================
-- Migration: vendor → supplier naming cleanup (2026-05-10)
-- Idempotent — safe to re-run on any environment.
--
-- Covers:
--   1. master.asset.vendor_id          → supplier_id  (column + FK + index)
--   2. document.purchase_invoice       → is_one_time_vendor → is_one_time_supplier (column)
--   3. document.purchase_invoice       → pi_source_chk  (one_time_vendor → one_time_supplier)
--   4. document.purchase_invoice rows  → invoice_source data migration
--   5. control.lookup_value            → one_time_vendor code migration
-- =============================================================================

-- ── 1. master.asset: rename vendor_id → supplier_id ─────────────────────────

DO $m1$
BEGIN
    -- Column rename (idempotent: skip if supplier_id already exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'master' AND table_name = 'asset'
           AND column_name = 'vendor_id'
    ) THEN
        ALTER TABLE master.asset RENAME COLUMN vendor_id TO supplier_id;
        RAISE NOTICE 'master.asset.vendor_id → supplier_id: column renamed';
    ELSE
        RAISE NOTICE 'master.asset.vendor_id → supplier_id: already renamed, skipping';
    END IF;
END $m1$;

-- Index rename (idempotent via IF EXISTS)
DO $m1_idx$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'master' AND tablename = 'asset'
           AND indexname = 'asset_vendor_idx'
    ) THEN
        ALTER INDEX master.asset_vendor_idx RENAME TO asset_supplier_idx;
        RAISE NOTICE 'master.asset_vendor_idx → asset_supplier_idx: index renamed';
    END IF;
END $m1_idx$;

-- FK constraint rename (idempotent via pg_constraint)
DO $m1_fk$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'asset_vendor_fk'
           AND conrelid = 'master.asset'::regclass
    ) THEN
        ALTER TABLE master.asset RENAME CONSTRAINT asset_vendor_fk TO asset_supplier_fk;
        RAISE NOTICE 'asset_vendor_fk → asset_supplier_fk: constraint renamed';
    END IF;
END $m1_fk$;

-- ── 2. document.purchase_invoice: is_one_time_vendor → is_one_time_supplier ──

DO $m2$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'document' AND table_name = 'purchase_invoice'
           AND column_name = 'is_one_time_vendor'
    ) THEN
        ALTER TABLE document.purchase_invoice
            RENAME COLUMN is_one_time_vendor TO is_one_time_supplier;
        RAISE NOTICE 'document.purchase_invoice.is_one_time_vendor → is_one_time_supplier: column renamed';
    ELSE
        RAISE NOTICE 'document.purchase_invoice.is_one_time_vendor → is_one_time_supplier: already renamed, skipping';
    END IF;
END $m2$;

-- ── 3. document.purchase_invoice: pi_source_chk constraint ───────────────────
--    one_time_vendor → one_time_supplier in the CHECK constraint

DO $m3$
BEGIN
    -- Only proceed if the old constraint still references 'one_time_vendor'
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'document' AND t.relname = 'purchase_invoice'
          AND c.conname = 'pi_source_chk'
          AND pg_get_constraintdef(c.oid) LIKE '%one_time_vendor%'
    ) THEN
        ALTER TABLE document.purchase_invoice DROP CONSTRAINT pi_source_chk;
        ALTER TABLE document.purchase_invoice
            ADD CONSTRAINT pi_source_chk
            CHECK (invoice_source IN ('po_based','contract_based','non_po','one_time_supplier'));
        RAISE NOTICE 'document.purchase_invoice pi_source_chk: one_time_vendor → one_time_supplier';
    ELSE
        RAISE NOTICE 'document.purchase_invoice pi_source_chk: already updated or does not reference one_time_vendor, skipping';
    END IF;
END $m3$;

-- ── 4. Data migration: invoice_source rows ───────────────────────────────────

UPDATE document.purchase_invoice
   SET invoice_source = 'one_time_supplier'
 WHERE invoice_source = 'one_time_vendor';

-- ── 5. Lookup value code migration ───────────────────────────────────────────

UPDATE control.lookup_value
   SET code = 'one_time_supplier',
       name = 'One-Time Supplier',
       description = 'Invoice from a party not in supplier master data.'
 WHERE domain_code = 'document.purchase_invoice_source'
   AND code = 'one_time_vendor'
   AND tenant_id IS NULL;

-- ── 6. master.supplier.supplier_type column default ─────────────────────────

DO $m6$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_attrdef ad
          JOIN pg_attribute a  ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
          JOIN pg_class      c ON c.oid = ad.adrelid
          JOIN pg_namespace  n ON n.oid = c.relnamespace
         WHERE n.nspname = 'master' AND c.relname = 'supplier'
           AND a.attname = 'supplier_type'
           AND pg_get_expr(ad.adbin, ad.adrelid) = '''vendor''::text'
    ) THEN
        ALTER TABLE master.supplier
            ALTER COLUMN supplier_type SET DEFAULT 'general';
        RAISE NOTICE 'master.supplier.supplier_type DEFAULT vendor → general';
    ELSE
        RAISE NOTICE 'master.supplier.supplier_type DEFAULT: already updated or no default, skipping';
    END IF;
END $m6$;

-- ── 7. master.accounting_profile: AP_ADVANCE_VENDOR → AP_ADVANCE_SUPPLIER ───
--    Industry pack seeds the code as AP_ADVANCE_VENDOR; technostat tenant
--    already has AP_ADVANCE_SUPPLIER (from 004_technostat_finance_controls.sql).
--    Step 7a: drop the duplicate for tenants that have both codes.
--    Step 7b: rename remaining AP_ADVANCE_VENDOR rows.

DO $m7$
BEGIN
    -- Table is created in Phase 3 (030_industry/ap_non_po). Skip cleanly at Phase 2.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'master' AND table_name = 'accounting_profile'
    ) THEN
        RAISE NOTICE 'master.accounting_profile: table not yet created (Phase 3 dep), skipping';
    ELSIF EXISTS (
        SELECT 1 FROM master.accounting_profile
         WHERE code = 'AP_ADVANCE_VENDOR'
    ) THEN
        -- Remove AP_ADVANCE_VENDOR for tenants that already have AP_ADVANCE_SUPPLIER
        DELETE FROM master.accounting_profile ap_old
         WHERE ap_old.code = 'AP_ADVANCE_VENDOR'
           AND EXISTS (
               SELECT 1 FROM master.accounting_profile ap_new
                WHERE ap_new.tenant_id = ap_old.tenant_id
                  AND ap_new.code = 'AP_ADVANCE_SUPPLIER'
           );

        -- Rename remaining AP_ADVANCE_VENDOR to AP_ADVANCE_SUPPLIER
        UPDATE master.accounting_profile
           SET code = 'AP_ADVANCE_SUPPLIER',
               name = 'AP Advance — Supplier Level'
         WHERE code = 'AP_ADVANCE_VENDOR';

        RAISE NOTICE 'master.accounting_profile: AP_ADVANCE_VENDOR → AP_ADVANCE_SUPPLIER';
    ELSE
        RAISE NOTICE 'master.accounting_profile: AP_ADVANCE_VENDOR not found, skipping';
    END IF;
END $m7$;

-- ── 8. master.supplier.supplier_type_chk: add 'general', drop 'vendor' ──────

DO $m8$
BEGIN
    -- Only proceed if the constraint still allows 'vendor' (not 'general')
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'master' AND t.relname = 'supplier'
           AND c.conname = 'supplier_type_chk'
           AND pg_get_constraintdef(c.oid) LIKE '%vendor%'
    ) THEN
        ALTER TABLE master.supplier DROP CONSTRAINT supplier_type_chk;
        ALTER TABLE master.supplier
            ADD CONSTRAINT supplier_type_chk
            CHECK (supplier_type IN (
                'general', 'contractor', 'manufacturer',
                'service', 'utility', 'intercompany'));
        RAISE NOTICE 'master.supplier supplier_type_chk: vendor → general';
    ELSE
        RAISE NOTICE 'master.supplier supplier_type_chk: already updated, skipping';
    END IF;
END $m8$;
