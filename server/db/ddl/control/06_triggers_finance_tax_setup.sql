DROP TRIGGER IF EXISTS trg_tgc_version_scope ON control.tax_group_component;
CREATE TRIGGER trg_tgc_version_scope BEFORE INSERT OR UPDATE OF tenant_id,tax_group_id,tax_group_version_id
    ON control.tax_group_component FOR EACH ROW EXECUTE FUNCTION control.guard_tax_group_component_version();

DROP TRIGGER IF EXISTS trg_tgv_activation ON control.tax_group_version;
CREATE TRIGGER trg_tgv_activation BEFORE INSERT OR UPDATE OF status
    ON control.tax_group_version FOR EACH ROW EXECUTE FUNCTION control.guard_tax_group_version_activation();

DROP TRIGGER IF EXISTS trg_trr_ambiguity ON control.tax_resolution_rule;
CREATE TRIGGER trg_trr_ambiguity BEFORE INSERT OR UPDATE OF tenant_id,priority,effective_from,effective_to,status,
    scope_billto_jurisdiction_id,scope_shipto_jurisdiction_id,scope_billfrom_jurisdiction_id,scope_shipfrom_jurisdiction_id,
    scope_counterparty_tax_status,scope_commodity_category_id,scope_supplier_industry_code,scope_doc_entity_codes,
    requires_shipto_shipfrom_match,requires_shipto_shipfrom_mismatch
    ON control.tax_resolution_rule FOR EACH ROW EXECUTE FUNCTION control.guard_tax_resolution_rule_ambiguity();

DROP TRIGGER IF EXISTS trg_tgv_updated_at ON control.tax_group_version;
CREATE TRIGGER trg_tgv_updated_at BEFORE UPDATE ON control.tax_group_version
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
