-- =============================================================================
-- Migration: decommission master.item_category (2026-05-16)
-- Idempotent — safe to re-run on any environment.
--
-- Background:
--   master.item_category was an early procurement classification table seeded
--   via the now-removed 025_base pack.  The source DDL was never updated to
--   include it; instead, master.commodity_category was introduced as the
--   canonical classification hierarchy.  The live DB drifted: item_category
--   survived as an orphan referenced by item.category_id, product.category_id,
--   supplier.supp_spend_category_fk (wrong target), and the
--   trg_cc_validate_owner trigger function.
--
-- This migration aligns the live DB with source DDL:
--
--   §1  master.item          — drop category_id, add commodity_category_id
--   §2  master.product       — drop category_id, add commodity_category_id
--   §3  master.supplier      — fix supp_spend_category_fk → spend_category
--   §4  master.trg_cc_validate_owner — remove 'item_category' branch, add 'commodity_category'
--   §5  master.item_category — DROP TABLE CASCADE
--
-- After running this migration, regenerate Kysely types:
--   cd server/framework/adapters/db && pnpm run prisma:pull && pnpm run prisma:generate
-- =============================================================================


-- ── §1  master.item ─────────────────────────────────────────────────────────

-- 1a. Drop FK that references item_category
DO $m1a$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_schema = 'master' AND table_name = 'item'
           AND constraint_name = 'im_category_fk'
    ) THEN
        ALTER TABLE master.item DROP CONSTRAINT im_category_fk;
        RAISE NOTICE '§1a  master.item: dropped FK im_category_fk';
    ELSE
        RAISE NOTICE '§1a  master.item: FK im_category_fk already absent, skipping';
    END IF;
END $m1a$;

-- 1b. Drop old classification check (depends on category_id)
DO $m1b$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_schema = 'master' AND table_name = 'item'
           AND constraint_name = 'im_classification_chk'
    ) THEN
        ALTER TABLE master.item DROP CONSTRAINT im_classification_chk;
        RAISE NOTICE '§1b  master.item: dropped constraint im_classification_chk';
    ELSE
        RAISE NOTICE '§1b  master.item: constraint im_classification_chk already absent, skipping';
    END IF;
END $m1b$;

-- 1c. Drop stale index on category_id
DROP INDEX IF EXISTS master.im_category_pidx;
DO $$ BEGIN
    RAISE NOTICE '§1c  master.item: dropped index im_category_pidx (if existed)';
END $$;

-- 1d. Drop column category_id
DO $m1d$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'master' AND table_name = 'item'
           AND column_name = 'category_id'
    ) THEN
        ALTER TABLE master.item DROP COLUMN category_id;
        RAISE NOTICE '§1d  master.item: dropped column category_id';
    ELSE
        RAISE NOTICE '§1d  master.item: column category_id already absent, skipping';
    END IF;
END $m1d$;

-- 1e. Add commodity_category_id
DO $m1e$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'master' AND table_name = 'item'
           AND column_name = 'commodity_category_id'
    ) THEN
        ALTER TABLE master.item ADD COLUMN commodity_category_id uuid;
        RAISE NOTICE '§1e  master.item: added column commodity_category_id';
    ELSE
        RAISE NOTICE '§1e  master.item: column commodity_category_id already exists, skipping';
    END IF;
END $m1e$;

-- 1f. Recreate classification check using commodity_category_id
DO $m1f$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_schema = 'master' AND table_name = 'item'
           AND constraint_name = 'im_classification_chk'
    ) THEN
        ALTER TABLE master.item
            ADD CONSTRAINT im_classification_chk
            CHECK (product_id IS NOT NULL OR commodity_category_id IS NOT NULL);
        RAISE NOTICE '§1f  master.item: created constraint im_classification_chk (commodity_category_id)';
    ELSE
        RAISE NOTICE '§1f  master.item: constraint im_classification_chk already exists, skipping';
    END IF;
END $m1f$;

-- 1g. Add FK im_commodity_category_fk
DO $m1g$ BEGIN
    ALTER TABLE master.item ADD CONSTRAINT im_commodity_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id);
    RAISE NOTICE '§1g  master.item: added FK im_commodity_category_fk';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '§1g  master.item: FK im_commodity_category_fk already exists, skipping';
END $m1g$;

-- 1h. Create index on commodity_category_id
CREATE INDEX IF NOT EXISTS im_commodity_category_idx
    ON master.item (tenant_id, commodity_category_id)
    WHERE commodity_category_id IS NOT NULL;
DO $$ BEGIN
    RAISE NOTICE '§1h  master.item: created index im_commodity_category_idx (if not existed)';
END $$;


-- ── §2  master.product ──────────────────────────────────────────────────────

-- 2a. Drop FK prod_category_fk (→ item_category)
DO $m2a$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_schema = 'master' AND table_name = 'product'
           AND constraint_name = 'prod_category_fk'
    ) THEN
        ALTER TABLE master.product DROP CONSTRAINT prod_category_fk;
        RAISE NOTICE '§2a  master.product: dropped FK prod_category_fk';
    ELSE
        RAISE NOTICE '§2a  master.product: FK prod_category_fk already absent, skipping';
    END IF;
END $m2a$;

-- 2b. Drop stale index on category_id
DROP INDEX IF EXISTS master.prod_category_idx;
DO $$ BEGIN
    RAISE NOTICE '§2b  master.product: dropped index prod_category_idx (if existed)';
END $$;

-- 2c. Drop column category_id
DO $m2c$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'master' AND table_name = 'product'
           AND column_name = 'category_id'
    ) THEN
        ALTER TABLE master.product DROP COLUMN category_id;
        RAISE NOTICE '§2c  master.product: dropped column category_id';
    ELSE
        RAISE NOTICE '§2c  master.product: column category_id already absent, skipping';
    END IF;
END $m2c$;

-- 2d. Add commodity_category_id
DO $m2d$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'master' AND table_name = 'product'
           AND column_name = 'commodity_category_id'
    ) THEN
        ALTER TABLE master.product ADD COLUMN commodity_category_id uuid;
        RAISE NOTICE '§2d  master.product: added column commodity_category_id';
    ELSE
        RAISE NOTICE '§2d  master.product: column commodity_category_id already exists, skipping';
    END IF;
END $m2d$;

-- 2e. Add FK prod_commodity_category_fk
DO $m2e$ BEGIN
    ALTER TABLE master.product ADD CONSTRAINT prod_commodity_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id);
    RAISE NOTICE '§2e  master.product: added FK prod_commodity_category_fk';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '§2e  master.product: FK prod_commodity_category_fk already exists, skipping';
END $m2e$;

-- 2f. Create index on commodity_category_id
CREATE INDEX IF NOT EXISTS prod_commodity_category_idx
    ON master.product (tenant_id, commodity_category_id)
    WHERE commodity_category_id IS NOT NULL;
DO $$ BEGIN
    RAISE NOTICE '§2f  master.product: created index prod_commodity_category_idx (if not existed)';
END $$;


-- ── §3  master.supplier — fix supp_spend_category_fk ───────────────────────
--
-- In the live DB this FK wrongly references master.item_category.
-- Source DDL targets master.spend_category.  Fix it.

-- 3a. Drop wrong FK
DO $m3a$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_schema = 'master' AND table_name = 'supplier'
           AND constraint_name = 'supp_spend_category_fk'
    ) THEN
        ALTER TABLE master.supplier DROP CONSTRAINT supp_spend_category_fk;
        RAISE NOTICE '§3a  master.supplier: dropped FK supp_spend_category_fk (was pointing to item_category)';
    ELSE
        RAISE NOTICE '§3a  master.supplier: FK supp_spend_category_fk already absent, skipping';
    END IF;
END $m3a$;

-- 3b. Add correct FK -> master.commodity_category
DO $m3b$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'master' AND table_name = 'supplier'
          AND column_name = 'commodity_category_id'
    ) THEN
        ALTER TABLE master.supplier ADD CONSTRAINT supp_commodity_category_fk
            FOREIGN KEY (tenant_id, commodity_category_id)
            REFERENCES master.commodity_category (tenant_id, id)
            ON DELETE SET NULL;
        RAISE NOTICE '�3b master.supplier: added FK supp_commodity_category_fk -> commodity_category';
    ELSE
        RAISE NOTICE '�3b master.supplier: commodity_category_id absent, skipping';
    END IF;
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE '�3b master.supplier: FK supp_commodity_category_fk already exists, skipping';
END $m3b$;


-- ── §4  master.trg_cc_validate_owner — remove item_category branch ─────────

CREATE OR REPLACE FUNCTION master.trg_cc_validate_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_exists boolean;
BEGIN
    IF NEW.owner_type IS NULL OR NEW.owner_id IS NULL THEN
        RETURN NEW;
    END IF;

    CASE NEW.owner_type
        WHEN 'product' THEN
            SELECT EXISTS(SELECT 1 FROM master.product WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'spend_category' THEN
            SELECT EXISTS(SELECT 1 FROM master.spend_category WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'commodity_category' THEN
            SELECT EXISTS(SELECT 1 FROM master.commodity_category WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'item' THEN
            SELECT EXISTS(SELECT 1 FROM master.item WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'customer' THEN
            SELECT EXISTS(SELECT 1 FROM master.customer WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'supplier' THEN
            SELECT EXISTS(SELECT 1 FROM master.supplier WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        ELSE
            RAISE EXCEPTION 'commodity_classification: unknown owner_type "%"', NEW.owner_type
                USING ERRCODE = 'foreign_key_violation';
    END CASE;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'commodity_classification: owner_id (%) not found in master.% for tenant %',
            NEW.owner_id, NEW.owner_type, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_cc_validate_owner IS
    'Polymorphic owner FK validation for commodity_classification. '
    'Dispatches to product, spend_category, commodity_category, item, customer, supplier.';

DO $$ BEGIN
    RAISE NOTICE '§4   master.trg_cc_validate_owner: replaced (removed item_category branch, added commodity_category)';
END $$;


-- ── §5  DROP master.item_category ───────────────────────────────────────────
--
-- CASCADE removes: RLS policies (6), triggers (trg_pcat_status_changed,
-- trg_pcat_updated_at), self-referential FK (pcat_parent_fk), indexes
-- (pcat_active_pidx, pcat_parent_idx, pcat_tenant_idx), and FKs on
-- item_category itself (pc_default_tax_group_fk, pcat_created_by_fk,
-- pcat_tenant_fk, item_category_pkey, item_category_tenant_*_uq).
-- All dependent column FKs on other tables (item, product, supplier) were
-- already dropped in §1–§3 above.

DO $m5$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'master' AND table_name = 'item_category'
    ) THEN
        DROP TABLE master.item_category CASCADE;
        RAISE NOTICE '§5   master.item_category: table dropped (CASCADE)';
    ELSE
        RAISE NOTICE '§5   master.item_category: already absent, skipping';
    END IF;
END $m5$;
