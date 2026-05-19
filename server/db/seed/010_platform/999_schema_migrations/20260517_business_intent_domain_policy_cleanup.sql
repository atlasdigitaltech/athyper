-- ============================================================================
-- MIGRATION - Business intent domain policy cleanup
-- ============================================================================
-- Purpose:
--   Business intent is now a domain-purpose master only. Posting, tax, asset,
--   approval, and selectable behavior live on commodity category buy/sell
--   policy rows. This migration maps older leaf intent references back to the
--   standard domain intent and backfills product/item commodity categories
--   before legacy spend_category_id columns are removed.
-- Idempotent: Yes
-- ============================================================================

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS tmp_business_intent_domain_map (
        tenant_id uuid NOT NULL,
        old_id uuid NOT NULL,
        new_id uuid NOT NULL,
        old_code text NOT NULL,
        new_code text NOT NULL,
        PRIMARY KEY (tenant_id, old_id)
    ) ON COMMIT DROP;

    TRUNCATE tmp_business_intent_domain_map;

    INSERT INTO tmp_business_intent_domain_map (tenant_id, old_id, new_id, old_code, new_code)
    SELECT old_bi.tenant_id,
           old_bi.id,
           new_bi.id,
           old_bi.code,
           domain_map.new_code
    FROM master.business_intent old_bi
    JOIN LATERAL (
        SELECT CASE
            WHEN old_bi.code IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV') THEN NULL
            WHEN old_bi.code = 'OPEX_GENERAL' OR old_bi.code LIKE 'OPEX-%' OR old_bi.code LIKE 'BI-OPEX-%' THEN 'BI-OPEX'
            WHEN old_bi.code = 'CAPEX_GENERAL' OR old_bi.code LIKE 'CAPEX-%' OR old_bi.code LIKE 'BI-CAPEX-%' THEN 'BI-CAPEX'
            WHEN old_bi.code = 'ADMIN_GENERAL' OR old_bi.code LIKE 'ADMIN-%' OR old_bi.code LIKE 'BI-ADMIN-%' THEN 'BI-ADMIN'
            WHEN old_bi.code LIKE 'COGS-%' OR old_bi.code LIKE 'BI-COGS-%' THEN 'BI-COGS'
            WHEN old_bi.code LIKE 'REG-%' OR old_bi.code LIKE 'BI-REG-%' THEN 'BI-REG'
            WHEN old_bi.code LIKE 'TRANSFER-%' OR old_bi.code LIKE 'BI-TRANSFER-%' THEN 'BI-TRANSFER'
            WHEN old_bi.code LIKE 'REV-%' OR old_bi.code LIKE 'BI-REV-%' THEN 'BI-REV'
            WHEN old_bi.code LIKE 'DEFREV-%' OR old_bi.code LIKE 'BI-DEFREV-%' THEN 'BI-DEFREV'
            WHEN old_bi.domain = 'OPEX' THEN 'BI-OPEX'
            WHEN old_bi.domain = 'CAPEX' THEN 'BI-CAPEX'
            WHEN old_bi.domain = 'COST_OF_SALES' THEN 'BI-COGS'
            WHEN old_bi.domain = 'ADMIN' THEN 'BI-ADMIN'
            WHEN old_bi.domain = 'REGULATORY' THEN 'BI-REG'
            WHEN old_bi.domain = 'TRANSFER' THEN 'BI-TRANSFER'
            WHEN old_bi.domain = 'REVENUE' THEN 'BI-REV'
            WHEN old_bi.domain = 'DEFERRED_REVENUE' THEN 'BI-DEFREV'
            ELSE NULL
        END AS new_code
    ) domain_map ON domain_map.new_code IS NOT NULL
    JOIN master.business_intent new_bi
      ON new_bi.tenant_id = old_bi.tenant_id
     AND new_bi.code = domain_map.new_code
    WHERE old_bi.code <> domain_map.new_code;

    UPDATE master.business_intent bi
       SET parent_id = NULL,
           path = bi.code,
           depth = 0,
           updated_at = now(),
           updated_by = v_su
      FROM tmp_business_intent_domain_map m
     WHERE bi.tenant_id = m.tenant_id
       AND (bi.id = m.old_id OR bi.parent_id = m.old_id);

    UPDATE master.spend_category sc
       SET default_intent_id = m.new_id,
           updated_at = now(),
           updated_by = v_su
      FROM tmp_business_intent_domain_map m
     WHERE sc.tenant_id = m.tenant_id
       AND sc.default_intent_id = m.old_id;

    IF to_regclass('master.company_code_spend_policy') IS NOT NULL THEN
        EXECUTE $sql$
            UPDATE master.company_code_spend_policy csp
               SET default_intent_id = m.new_id,
                   updated_at = now(),
                   updated_by = $1
              FROM tmp_business_intent_domain_map m
             WHERE csp.tenant_id = m.tenant_id
               AND csp.default_intent_id = m.old_id
        $sql$ USING v_su;
    END IF;

    IF to_regclass('control.commodity_classification_to_intent_rule') IS NOT NULL THEN
        UPDATE control.commodity_classification_to_intent_rule r
           SET resolved_intent_id = m.new_id,
               resolved_domain = new_bi.domain,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
          JOIN master.business_intent new_bi
            ON new_bi.tenant_id = m.tenant_id
           AND new_bi.id = m.new_id
         WHERE r.tenant_id = m.tenant_id
           AND r.resolved_intent_id = m.old_id;
    END IF;

    IF to_regclass('control.commodity_category_buy_policy') IS NOT NULL THEN
        UPDATE control.commodity_category_buy_policy p
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE p.tenant_id = m.tenant_id
           AND p.business_intent_id = m.old_id;
    END IF;

    IF to_regclass('control.commodity_category_sell_policy') IS NOT NULL THEN
        UPDATE control.commodity_category_sell_policy p
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE p.tenant_id = m.tenant_id
           AND p.business_intent_id = m.old_id;
    END IF;

    IF to_regclass('control.intent_to_accounting_profile_rule') IS NOT NULL THEN
        UPDATE control.intent_to_accounting_profile_rule r
           SET intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE r.tenant_id = m.tenant_id
           AND r.intent_id = m.old_id;
    END IF;

    IF to_regclass('control.intent_profile_override') IS NOT NULL THEN
        UPDATE control.intent_profile_override o
           SET intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE o.tenant_id = m.tenant_id
           AND o.intent_id = m.old_id;
    END IF;

    IF to_regclass('control.forecast_line') IS NOT NULL THEN
        UPDATE control.forecast_line f
           SET intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE f.tenant_id = m.tenant_id
           AND f.intent_id = m.old_id;
    END IF;

    IF to_regclass('document.purchase_invoice_line') IS NOT NULL THEN
        UPDATE document.purchase_invoice_line l
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE l.tenant_id = m.tenant_id
           AND l.business_intent_id = m.old_id;
    END IF;

    IF to_regclass('document.invoice_line') IS NOT NULL THEN
        UPDATE document.invoice_line l
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE l.tenant_id = m.tenant_id
           AND l.business_intent_id = m.old_id;
    END IF;

    IF to_regclass('document.accounting_distribution') IS NOT NULL THEN
        UPDATE document.accounting_distribution d
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE d.tenant_id = m.tenant_id
           AND d.business_intent_id = m.old_id;
    END IF;

    IF to_regclass('document.commitment') IS NOT NULL THEN
        UPDATE document.commitment c
           SET intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE c.tenant_id = m.tenant_id
           AND c.intent_id = m.old_id;
    END IF;

    IF to_regclass('document.commitment_line') IS NOT NULL THEN
        UPDATE document.commitment_line l
           SET business_intent_id = m.new_id,
               updated_at = now(),
               updated_by = v_su
          FROM tmp_business_intent_domain_map m
         WHERE l.tenant_id = m.tenant_id
           AND l.business_intent_id = m.old_id;
    END IF;

    IF to_regclass('master.product') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'master'
             AND table_name = 'product'
             AND column_name = 'spend_category_id'
       ) THEN
        UPDATE master.product p
           SET commodity_category_id = cc.id,
               updated_at = now(),
               updated_by = v_su
          FROM master.spend_category sc
          JOIN master.commodity_category cc
            ON cc.tenant_id = sc.tenant_id
           AND cc.code = sc.code
         WHERE p.tenant_id = sc.tenant_id
           AND p.spend_category_id = sc.id
           AND p.commodity_category_id IS NULL;
    END IF;

    IF to_regclass('master.item') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'master'
             AND table_name = 'item'
             AND column_name = 'spend_category_id'
       ) THEN
        WITH resolved AS (
            SELECT
                i.id,
                i.tenant_id,
                COALESCE(cc.id, p.commodity_category_id) AS commodity_category_id
            FROM master.item i
            LEFT JOIN master.spend_category sc
              ON sc.tenant_id = i.tenant_id
             AND sc.id = i.spend_category_id
            LEFT JOIN master.commodity_category cc
              ON cc.tenant_id = sc.tenant_id
             AND cc.code = sc.code
            LEFT JOIN master.product p
              ON p.tenant_id = i.tenant_id
             AND p.id = i.product_id
        )
        UPDATE master.item i
           SET commodity_category_id = r.commodity_category_id,
               updated_at = now(),
               updated_by = v_su
          FROM resolved r
         WHERE i.tenant_id = r.tenant_id
           AND i.id = r.id
           AND i.commodity_category_id IS NULL
           AND r.commodity_category_id IS NOT NULL;
    END IF;

    DELETE FROM master.business_intent old_bi
      USING tmp_business_intent_domain_map m
     WHERE old_bi.tenant_id = m.tenant_id
       AND old_bi.id = m.old_id;

    ALTER TABLE IF EXISTS master.business_intent DROP CONSTRAINT IF EXISTS bi_gl_account_fk;
    ALTER TABLE IF EXISTS master.business_intent DROP CONSTRAINT IF EXISTS bi_default_tax_group_fk;
    ALTER TABLE IF EXISTS master.business_intent DROP CONSTRAINT IF EXISTS bi_auto_approve_chk;
    ALTER TABLE IF EXISTS master.business_intent DROP CONSTRAINT IF EXISTS bi_auto_approve_curr_chk;
    ALTER TABLE IF EXISTS master.business_intent DROP COLUMN IF EXISTS default_gl_account_id;
    ALTER TABLE IF EXISTS master.business_intent DROP COLUMN IF EXISTS default_tax_code;
    ALTER TABLE IF EXISTS master.business_intent DROP COLUMN IF EXISTS default_tax_group_id;
    ALTER TABLE IF EXISTS master.business_intent DROP COLUMN IF EXISTS default_asset_profile_code;
    ALTER TABLE IF EXISTS master.business_intent DROP COLUMN IF EXISTS is_approval_required;
    ALTER TABLE IF EXISTS master.business_intent DROP COLUMN IF EXISTS max_auto_approve_amount;
    ALTER TABLE IF EXISTS master.business_intent DROP COLUMN IF EXISTS max_auto_approve_currency;
    ALTER TABLE IF EXISTS master.business_intent DROP COLUMN IF EXISTS commodity_domain_affinities;

    ALTER TABLE IF EXISTS master.product DROP CONSTRAINT IF EXISTS prod_spend_category_fk;
    DROP INDEX IF EXISTS master.prod_spend_cat_idx;
    ALTER TABLE IF EXISTS master.product DROP COLUMN IF EXISTS spend_category_id;

    ALTER TABLE IF EXISTS master.item DROP CONSTRAINT IF EXISTS im_spend_category_fk;
    DROP INDEX IF EXISTS master.im_spend_category_idx;
    ALTER TABLE IF EXISTS master.item DROP COLUMN IF EXISTS spend_category_id;
END $$;
