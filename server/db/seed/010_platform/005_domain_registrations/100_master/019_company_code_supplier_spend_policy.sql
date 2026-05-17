-- 100_master/019_company_code_supplier_spend_policy.sql
-- Retired metadata cleanup.
-- Supplier-scoped buy behavior is now registered by
-- control.commodity_category_buy_policy with commodity_category_id.

DELETE FROM control.entity_operation
 WHERE entity_name = 'company_code_supplier_spend_policy';

DELETE FROM control.entity_lifecycle
 WHERE entity_name = 'company_code_supplier_spend_policy';

DELETE FROM control.entity
 WHERE entity_code = 'company_code_supplier_spend_policy'
   AND tenant_id IS NULL;
