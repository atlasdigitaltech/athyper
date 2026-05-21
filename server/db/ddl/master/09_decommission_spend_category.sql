-- ============================================================================
-- master/09_decommission_spend_category.sql
-- Purpose: retire legacy spend_category wiring after commodity_category cutover.
-- ============================================================================

DO $$
BEGIN
    IF to_regclass('master.commodity_classification') IS NOT NULL THEN
        UPDATE master.commodity_classification cc
           SET owner_type = 'commodity_category',
               metadata = COALESCE(cc.metadata, '{}'::jsonb)
                   || jsonb_build_object('_legacy_owner_type', 'spend_category'),
               updated_at = now()
         WHERE cc.owner_type = 'spend_category'
           AND EXISTS (
               SELECT 1
               FROM master.commodity_category ccat
               WHERE ccat.tenant_id = cc.tenant_id
                 AND ccat.id = cc.owner_id
           );
    END IF;

    IF to_regclass('master.supplier_spend_category') IS NOT NULL
       AND to_regclass('master.supplier_commodity_category') IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'master'
             AND table_name = 'supplier_spend_category'
             AND column_name = 'spend_category_id'
       ) THEN
        INSERT INTO master.supplier_commodity_category (
            id, tenant_id, supplier_id, commodity_category_id, is_primary,
            effective_from, effective_until, notes, metadata, status,
            status_changed_at, status_changed_by, created_at, created_by,
            updated_at, updated_by
        )
        SELECT
            id, tenant_id, supplier_id, spend_category_id, is_primary,
            effective_from, effective_until, notes,
            COALESCE(metadata, '{}'::jsonb)
                || jsonb_build_object('_legacy_source', 'supplier_spend_category'),
            status, status_changed_at, status_changed_by, created_at, created_by,
            updated_at, updated_by
        FROM master.supplier_spend_category
        ON CONFLICT (tenant_id, supplier_id, commodity_category_id) DO UPDATE SET
            is_primary = EXCLUDED.is_primary,
            effective_from = EXCLUDED.effective_from,
            effective_until = EXCLUDED.effective_until,
            notes = EXCLUDED.notes,
            metadata = master.supplier_commodity_category.metadata || EXCLUDED.metadata,
            status = EXCLUDED.status,
            updated_at = now(),
            updated_by = EXCLUDED.updated_by;
    END IF;

    IF to_regclass('control.commodity_classification_to_intent_rule') IS NOT NULL THEN
        UPDATE control.commodity_classification_to_intent_rule
           SET classification_source = 'COMMODITY_CATEGORY',
               updated_at = now()
         WHERE classification_source = 'SPEND_CATEGORY';
    END IF;

    IF to_regclass('master.owner_type') IS NOT NULL THEN
        UPDATE master.owner_type
           SET status = 'deprecated',
               updated_at = now(),
               updated_by = '00000000-0000-0000-0000-000000000000'
         WHERE tenant_id IS NULL
           AND code = 'spend_category'
           AND status <> 'deprecated';
    END IF;

    IF to_regclass('control.lookup_value') IS NOT NULL THEN
        UPDATE control.lookup_value
           SET status = 'deprecated',
               updated_at = now(),
               updated_by = '00000000-0000-0000-0000-000000000000'
         WHERE tenant_id IS NULL
           AND (
               (domain_code = 'master.cc_owner_type' AND code = 'spend_category')
               OR (domain_code = 'control.classification_source' AND code = 'spend_category')
           )
           AND status <> 'deprecated';
    END IF;
END $$;

DROP FUNCTION IF EXISTS control.resolve_spend_category_policy(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS master.fn_resolve_spend_category_ou_defaults(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS master.fn_resolve_spend_category_defaults(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS master.trg_sc_maintain_root_category();

DROP TABLE IF EXISTS master.company_code_spend_policy CASCADE;
DROP TABLE IF EXISTS master.company_code_supplier_spend_policy CASCADE;
DROP TABLE IF EXISTS master.supplier_spend_category CASCADE;
DROP TABLE IF EXISTS master.spend_category CASCADE;
