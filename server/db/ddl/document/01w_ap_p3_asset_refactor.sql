-- ============================================================================
-- document/01w_ap_p3_asset_refactor.sql
-- Concept: PIL Asset Refactor (P3 v1.2)
-- Depends on: 01e_tables_invoice.sql (PIL),
--             master/01c_tables_extended.sql (asset_class, asset)
-- Spec: docs/specs/purchase_invoice_field_design.md §3.2, §3.4
--
-- Replaces PIL's orphan asset fields (is_asset boolean, asset_category_id uuid)
-- with proper FK-backed columns:
--   • asset_treatment    enum discriminator (none/expense_low_value/class_pending/target_asset)
--   • asset_class_id     FK → master.asset_class
--   • target_asset_id    FK → master.asset (NULL for class_pending)
--
-- This file ADDS the new columns nullable + constraints NOT VALID.
-- Backfill: server/scripts/backfill-pil-asset-treatment.ts
-- Verify:   server/scripts/verify-asset-treatment-mapping.ts
-- After backfill + verify pass, the operator runs:
--   ALTER TABLE document.purchase_invoice_line ALTER COLUMN asset_treatment SET NOT NULL;
--   ALTER TABLE document.purchase_invoice_line VALIDATE CONSTRAINT pil_asset_treatment_chk;
--   ALTER TABLE document.purchase_invoice_line VALIDATE CONSTRAINT pil_asset_class_required;
--   ALTER TABLE document.purchase_invoice_line VALIDATE CONSTRAINT pil_asset_target_required;
--
-- Legacy is_asset + asset_category_id stay until P5 (drop only after readers migrate).
-- ============================================================================


-- =============================================================================
-- §P3.1  PIL asset columns
-- =============================================================================

ALTER TABLE document.purchase_invoice_line
    ADD COLUMN IF NOT EXISTS asset_treatment text DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS asset_class_id  uuid,
    ADD COLUMN IF NOT EXISTS target_asset_id uuid;

COMMENT ON COLUMN document.purchase_invoice_line.asset_treatment IS
    'Asset treatment discriminator: none | expense_low_value | class_pending | target_asset. '
    'Replaces the legacy is_asset boolean. Drives AD.is_capex + asset_posting_target at posting.';

COMMENT ON COLUMN document.purchase_invoice_line.asset_class_id IS
    'FK → master.asset_class. Required when asset_treatment <> ''none''. '
    'Replaces the orphan asset_category_id column (P5 drops the orphan).';

COMMENT ON COLUMN document.purchase_invoice_line.target_asset_id IS
    'FK → master.asset. Required when asset_treatment = ''target_asset''. '
    'NULL for class_pending (no master record yet — created at settlement).';


-- =============================================================================
-- §P3.2  Foreign keys (tenant-scoped composite)
-- =============================================================================

DO $$
BEGIN
    ALTER TABLE document.purchase_invoice_line
        ADD CONSTRAINT pil_asset_class_fk
        FOREIGN KEY (tenant_id, asset_class_id)
        REFERENCES master.asset_class (tenant_id, id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.purchase_invoice_line
        ADD CONSTRAINT pil_target_asset_fk
        FOREIGN KEY (tenant_id, target_asset_id)
        REFERENCES master.asset (tenant_id, id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;


-- =============================================================================
-- §P3.3  CHECK constraints (NOT VALID — VALIDATE after backfill)
-- =============================================================================

DO $$
BEGIN
    ALTER TABLE document.purchase_invoice_line
        ADD CONSTRAINT pil_asset_treatment_chk CHECK (
            asset_treatment IN ('none','expense_low_value','class_pending','target_asset')
        ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    -- Asset class required for ALL non-'none' treatments (including target_asset)
    ALTER TABLE document.purchase_invoice_line
        ADD CONSTRAINT pil_asset_class_required CHECK (
            asset_treatment = 'none' OR asset_class_id IS NOT NULL
        ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.purchase_invoice_line
        ADD CONSTRAINT pil_asset_target_required CHECK (
            asset_treatment <> 'target_asset' OR target_asset_id IS NOT NULL
        ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;


-- =============================================================================
-- §P3.4  Asset target validation function
-- =============================================================================
-- Verifies (at PIL INSERT/UPDATE):
--   • target_asset is in same tenant
--   • target_asset.company_code_id matches parent PI.company_code_id
--   • target_asset.asset_class_id matches PIL.asset_class_id
--   • asset_class.useful_life_override_policy='forbid' rejects custom useful_life
--     in metadata.asset.useful_life_months_override
-- =============================================================================

CREATE OR REPLACE FUNCTION document.fn_pil_validate_asset_target()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target_class_id  uuid;
    target_company   uuid;
    parent_company   uuid;
    class_life_pol   text;
    has_life_override boolean;
BEGIN
    -- Short-circuit for 'none' (no asset linkage)
    IF NEW.asset_treatment IS NULL OR NEW.asset_treatment = 'none' THEN
        RETURN NEW;
    END IF;

    -- target_asset validation
    IF NEW.target_asset_id IS NOT NULL THEN
        SELECT a.asset_class_id, a.company_code_id INTO target_class_id, target_company
          FROM master.asset a
         WHERE a.id        = NEW.target_asset_id
           AND a.tenant_id = NEW.tenant_id;

        IF target_class_id IS NULL THEN
            RAISE EXCEPTION 'ASSET_TARGET_NOT_FOUND: target_asset_id=% tenant=%',
                NEW.target_asset_id, NEW.tenant_id
                USING ERRCODE = 'PIL01';
        END IF;

        -- Class consistency
        IF NEW.asset_class_id IS NOT NULL AND NEW.asset_class_id <> target_class_id THEN
            RAISE EXCEPTION 'ASSET_TARGET_CLASS_MISMATCH: PIL.asset_class_id=% but target_asset.asset_class_id=%',
                NEW.asset_class_id, target_class_id
                USING ERRCODE = 'PIL02';
        END IF;

        -- Company-code consistency (target asset must belong to invoice's company code)
        SELECT pi.company_code_id INTO parent_company
          FROM document.purchase_invoice pi
         WHERE pi.id        = NEW.purchase_invoice_id
           AND pi.tenant_id = NEW.tenant_id;

        IF parent_company IS NOT NULL AND target_company IS NOT NULL
           AND parent_company <> target_company THEN
            RAISE EXCEPTION 'ASSET_TARGET_COMPANY_MISMATCH: PI.company_code=% but target_asset.company_code=%',
                parent_company, target_company
                USING ERRCODE = 'PIL03';
        END IF;
    END IF;

    -- Asset class policy enforcement (useful_life_override_policy='forbid')
    IF NEW.asset_class_id IS NOT NULL THEN
        SELECT useful_life_override_policy INTO class_life_pol
          FROM master.asset_class
         WHERE id        = NEW.asset_class_id
           AND tenant_id = NEW.tenant_id;

        IF class_life_pol = 'forbid' THEN
            has_life_override :=
                (NEW.metadata ? 'asset')
                AND (NEW.metadata->'asset' ? 'useful_life_months_override');
            IF has_life_override THEN
                RAISE EXCEPTION 'ASSET_CLASS_POLICY_VIOLATION: class policy forbids useful_life override but metadata.asset.useful_life_months_override is set'
                    USING ERRCODE = 'PIL04';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_pil_validate_asset_target() IS
    'BEFORE INSERT/UPDATE on purchase_invoice_line: validates asset_treatment + '
    'asset_class_id + target_asset_id triplet. Checks target_asset tenant + '
    'company_code + class consistency, plus master.asset_class.useful_life_override_policy.';


-- =============================================================================
-- §P3.5  Indexes (partial — common AP asset queries)
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_pil_asset_target
    ON document.purchase_invoice_line (tenant_id, target_asset_id)
    WHERE target_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_pil_asset_class
    ON document.purchase_invoice_line (tenant_id, asset_class_id)
    WHERE asset_treatment <> 'none';


-- =============================================================================
-- End of 01w_ap_p3_asset_refactor.sql
-- =============================================================================
