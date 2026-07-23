CREATE OR REPLACE FUNCTION control.guard_tax_group_component_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.tax_group_version_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM control.tax_group_version version
         WHERE version.tenant_id=NEW.tenant_id AND version.id=NEW.tax_group_version_id
           AND version.tax_group_id=NEW.tax_group_id
    ) THEN
        RAISE EXCEPTION 'Tax Group component version must belong to the same Tenant and Tax Group'
            USING ERRCODE='23503';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION control.guard_tax_group_version_activation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status='active' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND NOT EXISTS (
        SELECT 1 FROM control.tax_group_component component
         WHERE component.tenant_id=NEW.tenant_id AND component.tax_group_id=NEW.tax_group_id
           AND component.tax_group_version_id=NEW.id AND component.status='active'
    ) THEN
        RAISE EXCEPTION 'An active Tax Group Version requires at least one active component'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION control.guard_tax_resolution_rule_ambiguity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status='active' AND EXISTS (
        SELECT 1 FROM control.tax_resolution_rule existing
         WHERE existing.tenant_id=NEW.tenant_id AND existing.id<>NEW.id AND existing.status='active'
           AND existing.priority=NEW.priority
           AND daterange(existing.effective_from,COALESCE(existing.effective_to,'9999-12-31'::date),'[]')
               && daterange(NEW.effective_from,COALESCE(NEW.effective_to,'9999-12-31'::date),'[]')
           AND (existing.scope_billto_jurisdiction_id IS NULL OR NEW.scope_billto_jurisdiction_id IS NULL OR existing.scope_billto_jurisdiction_id=NEW.scope_billto_jurisdiction_id)
           AND (existing.scope_shipto_jurisdiction_id IS NULL OR NEW.scope_shipto_jurisdiction_id IS NULL OR existing.scope_shipto_jurisdiction_id=NEW.scope_shipto_jurisdiction_id)
           AND (existing.scope_billfrom_jurisdiction_id IS NULL OR NEW.scope_billfrom_jurisdiction_id IS NULL OR existing.scope_billfrom_jurisdiction_id=NEW.scope_billfrom_jurisdiction_id)
           AND (existing.scope_shipfrom_jurisdiction_id IS NULL OR NEW.scope_shipfrom_jurisdiction_id IS NULL OR existing.scope_shipfrom_jurisdiction_id=NEW.scope_shipfrom_jurisdiction_id)
           AND (existing.scope_counterparty_tax_status IS NULL OR NEW.scope_counterparty_tax_status IS NULL OR existing.scope_counterparty_tax_status=NEW.scope_counterparty_tax_status)
           AND (existing.scope_commodity_category_id IS NULL OR NEW.scope_commodity_category_id IS NULL OR existing.scope_commodity_category_id=NEW.scope_commodity_category_id)
           AND (existing.scope_supplier_industry_code IS NULL OR NEW.scope_supplier_industry_code IS NULL OR existing.scope_supplier_industry_code=NEW.scope_supplier_industry_code)
           AND (existing.scope_doc_entity_codes IS NULL OR NEW.scope_doc_entity_codes IS NULL OR existing.scope_doc_entity_codes && NEW.scope_doc_entity_codes)
           AND NOT (existing.requires_shipto_shipfrom_match AND NEW.requires_shipto_shipfrom_mismatch)
           AND NOT (existing.requires_shipto_shipfrom_mismatch AND NEW.requires_shipto_shipfrom_match)
    ) THEN
        RAISE EXCEPTION 'Ambiguous active Tax Resolution Rule at priority % for an overlapping context and effective period',NEW.priority
            USING ERRCODE='23505';
    END IF;
    RETURN NEW;
END $$;

