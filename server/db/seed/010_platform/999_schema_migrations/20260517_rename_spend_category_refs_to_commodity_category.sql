-- 2026-05-17: Rename transactional/supplier spend-category references to
-- commodity_category_id and attach them to master.commodity_category.

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('document','accounting_distribution','spend_category_id','commodity_category_id'),
            ('document','commitment_line','spend_category_id','commodity_category_id'),
            ('document','purchase_invoice_line','spend_category_id','commodity_category_id'),
            ('document','purchase_requisition_line','spend_category_id','commodity_category_id'),
            ('document','service_entry_sheet_line','spend_category_id','commodity_category_id'),
            ('control','tax_rate_schedule','scope_spend_category_id','scope_commodity_category_id'),
            ('control','forecast_line','spend_category_id','commodity_category_id'),
            ('master','supplier','spend_category_id','commodity_category_id'),
            ('master','supplier_spend_category','spend_category_id','commodity_category_id')
        ) AS x(schema_name, table_name, old_column, new_column)
    LOOP
        IF to_regclass(format('%I.%I', r.schema_name, r.table_name)) IS NULL THEN
            CONTINUE;
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = r.schema_name
              AND table_name = r.table_name
              AND column_name = r.old_column
        ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = r.schema_name
              AND table_name = r.table_name
              AND column_name = r.new_column
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I.%I RENAME COLUMN %I TO %I',
                r.schema_name, r.table_name, r.old_column, r.new_column
            );
        END IF;
    END LOOP;
END $$;

ALTER TABLE IF EXISTS document.accounting_distribution DROP CONSTRAINT IF EXISTS ad_spend_category_fk;
ALTER TABLE IF EXISTS document.accounting_distribution DROP CONSTRAINT IF EXISTS ad_commodity_category_fk;
ALTER TABLE IF EXISTS document.commitment_line DROP CONSTRAINT IF EXISTS cl_spend_category_fk;
ALTER TABLE IF EXISTS document.commitment_line DROP CONSTRAINT IF EXISTS cl_commodity_category_fk;
ALTER TABLE IF EXISTS document.purchase_invoice_line DROP CONSTRAINT IF EXISTS pil_spend_category_fk;
ALTER TABLE IF EXISTS document.purchase_invoice_line DROP CONSTRAINT IF EXISTS pil_commodity_category_fk;
ALTER TABLE IF EXISTS document.purchase_requisition_line DROP CONSTRAINT IF EXISTS prl_spend_category_fk;
ALTER TABLE IF EXISTS document.purchase_requisition_line DROP CONSTRAINT IF EXISTS prl_commodity_category_fk;
ALTER TABLE IF EXISTS document.service_entry_sheet_line DROP CONSTRAINT IF EXISTS sesl_spend_category_fk;
ALTER TABLE IF EXISTS document.service_entry_sheet_line DROP CONSTRAINT IF EXISTS sesl_commodity_category_fk;
ALTER TABLE IF EXISTS control.tax_rate_schedule DROP CONSTRAINT IF EXISTS trs_spend_cat_fk;
ALTER TABLE IF EXISTS control.tax_rate_schedule DROP CONSTRAINT IF EXISTS trs_commodity_category_fk;
ALTER TABLE IF EXISTS control.forecast_line DROP CONSTRAINT IF EXISTS fk_fl_commodity_category;
ALTER TABLE IF EXISTS master.supplier DROP CONSTRAINT IF EXISTS supp_spend_category_fk;
ALTER TABLE IF EXISTS master.supplier DROP CONSTRAINT IF EXISTS supp_commodity_category_fk;
ALTER TABLE IF EXISTS master.supplier_spend_category DROP CONSTRAINT IF EXISTS sscat_category_fk;

DO $$ BEGIN
    ALTER TABLE document.accounting_distribution ADD CONSTRAINT ad_commodity_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.commitment_line ADD CONSTRAINT cl_commodity_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_invoice_line ADD CONSTRAINT pil_commodity_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.purchase_requisition_line ADD CONSTRAINT prl_commodity_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE document.service_entry_sheet_line ADD CONSTRAINT sesl_commodity_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.tax_rate_schedule ADD CONSTRAINT trs_commodity_category_fk
        FOREIGN KEY (tenant_id, scope_commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.forecast_line ADD CONSTRAINT fk_fl_commodity_category
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id)
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.supplier ADD CONSTRAINT supp_commodity_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.supplier_spend_category ADD CONSTRAINT sscat_category_fk
        FOREIGN KEY (tenant_id, commodity_category_id)
        REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object OR undefined_table OR undefined_column THEN NULL; END $$;

DROP INDEX IF EXISTS document.ad_spend_category_idx;
DROP INDEX IF EXISTS document.pil_spend_category_idx;

CREATE INDEX IF NOT EXISTS ad_commodity_category_idx
    ON document.accounting_distribution (tenant_id, commodity_category_id)
    WHERE commodity_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pil_commodity_category_idx
    ON document.purchase_invoice_line (tenant_id, commodity_category_id)
    WHERE commodity_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fl_commodity_category
    ON control.forecast_line (tenant_id, commodity_category_id, fiscal_year)
    WHERE commodity_category_id IS NOT NULL;

DELETE FROM control.entity_field old_ef
USING control.entity_field new_ef,
      control.entity_version ev,
      control.entity e
WHERE old_ef.entity_version_id = ev.id
  AND new_ef.entity_version_id = old_ef.entity_version_id
  AND e.id = ev.entity_id
  AND old_ef.name = 'spend_category_id'
  AND new_ef.name = 'commodity_category_id'
  AND (
       (e.table_schema = 'document' AND e.table_name IN ('accounting_distribution','purchase_invoice_line'))
       OR (e.table_schema = 'master' AND e.table_name IN ('supplier','supplier_spend_category'))
  );

UPDATE control.entity_field ef
   SET name = 'commodity_category_id',
       column_name = 'commodity_category_id',
       label = 'Commodity Category',
       validation = jsonb_set(COALESCE(validation, '{}'::jsonb), '{ref_entity}', '"commodity_category"', true),
       reference_config = CASE
           WHEN reference_config IS NULL THEN reference_config
           ELSE jsonb_set(reference_config, '{target_entity}', '"commodity_category"', true)
       END,
       updated_at = now()
  FROM control.entity_version ev
  JOIN control.entity e ON e.id = ev.entity_id
 WHERE ef.entity_version_id = ev.id
   AND ef.name = 'spend_category_id'
   AND NOT EXISTS (
       SELECT 1
       FROM control.entity_field existing
       WHERE existing.entity_version_id = ef.entity_version_id
         AND existing.name = 'commodity_category_id'
   )
   AND (
        (e.table_schema = 'document' AND e.table_name IN ('accounting_distribution','purchase_invoice_line'))
        OR (e.table_schema = 'master' AND e.table_name IN ('supplier','supplier_spend_category'))
   );
