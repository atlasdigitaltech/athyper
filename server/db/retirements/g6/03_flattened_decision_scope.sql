-- Inactive G6 surface migration. Apply only through the signed incremental-retirement runner.
DROP TRIGGER IF EXISTS trg_business_partner_qualification_scope_rows ON control.business_partner_qualification;
DROP TRIGGER IF EXISTS trg_supplier_preference_scope_rows ON control.supplier_preference_designation;
DROP TRIGGER IF EXISTS trg_customer_designation_scope_rows ON control.customer_account_designation;
DROP TRIGGER IF EXISTS trg_customer_credit_review_scope_rows ON control.customer_credit_review;
DROP FUNCTION IF EXISTS control.trg_materialize_legacy_decision_scope();
ALTER TABLE control.business_partner_qualification DROP COLUMN operating_organization_id CASCADE,DROP COLUMN company_code_id CASCADE,DROP COLUMN commodity_capability_id CASCADE;
ALTER TABLE control.supplier_preference_designation DROP COLUMN operating_organization_id CASCADE,DROP COLUMN company_code_id CASCADE,DROP COLUMN commodity_category_id CASCADE;
ALTER TABLE control.customer_account_designation DROP COLUMN operating_organization_id CASCADE,DROP COLUMN company_code_id CASCADE;
ALTER TABLE control.customer_credit_review DROP COLUMN operating_organization_id CASCADE,DROP COLUMN company_code_id CASCADE;
CREATE VIEW control.current_customer_account_designation WITH(security_invoker=true,security_barrier=true) AS
SELECT designation.id AS designation_id,designation.tenant_id,designation.business_partner_id,designation.customer_id,
  (SELECT scope.operating_organization_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=designation.tenant_id AND scope.customer_designation_id=designation.id AND scope.scope_mode='include' AND scope.scope_kind='operating_organization' ORDER BY scope.scope_group,scope.id LIMIT 1) AS operating_organization_id,
  (SELECT scope.company_code_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=designation.tenant_id AND scope.customer_designation_id=designation.id AND scope.scope_mode='include' AND scope.scope_kind='company_code' ORDER BY scope.scope_group,scope.id LIMIT 1) AS company_code_id,
  designation.designation_type,designation.priority_tier,designation.effective_from,designation.effective_until,designation.rationale,designation.approved_at,designation.approved_by,designation.row_version
FROM control.customer_account_designation designation
WHERE designation.status='approved' AND designation.effective_from<=CURRENT_DATE AND(designation.effective_until IS NULL OR designation.effective_until>CURRENT_DATE);
CREATE VIEW control.current_customer_credit_limit WITH(security_invoker=true,security_barrier=true) AS
SELECT review.id AS credit_review_id,review.tenant_id,review.business_partner_id,review.customer_id,
  (SELECT scope.operating_organization_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id AND scope.scope_mode='include' AND scope.scope_kind='operating_organization' ORDER BY scope.scope_group,scope.id LIMIT 1) AS operating_organization_id,
  (SELECT scope.company_code_id FROM control.business_partner_decision_scope scope WHERE scope.tenant_id=review.tenant_id AND scope.credit_review_id=review.id AND scope.scope_mode='include' AND scope.scope_kind='company_code' ORDER BY scope.scope_group,scope.id LIMIT 1) AS company_code_id,
  review.approved_credit_limit,review.approved_currency_code,review.decision,review.effective_from,review.effective_until,review.approved_at,review.approved_by,review.row_version
FROM control.customer_credit_review review
WHERE review.decision IN('approved','conditional') AND review.approved_credit_limit IS NOT NULL AND review.effective_from<=CURRENT_DATE AND(review.effective_until IS NULL OR review.effective_until>CURRENT_DATE);
REVOKE ALL ON control.current_customer_account_designation,control.current_customer_credit_limit FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT ON control.current_customer_account_designation,control.current_customer_credit_limit TO athyperapp; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT ON control.current_customer_account_designation,control.current_customer_credit_limit TO athyperadmin; END IF;
END $$;
DO $$ BEGIN IF to_regclass('control.business_partner_decision_scope') IS NULL THEN RAISE EXCEPTION 'normalized decision scope authority is absent'; END IF;IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='control' AND ((table_name='business_partner_qualification' AND column_name IN('operating_organization_id','company_code_id','commodity_capability_id')) OR (table_name='supplier_preference_designation' AND column_name IN('operating_organization_id','company_code_id','commodity_category_id')) OR (table_name IN('customer_account_designation','customer_credit_review') AND column_name IN('operating_organization_id','company_code_id')))) THEN RAISE EXCEPTION 'flattened decision-scope retirement failed'; END IF;END $$;
