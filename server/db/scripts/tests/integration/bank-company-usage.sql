-- Run after 15_bank_account_company_usage.sql inside a transaction; roll back afterward.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM master.bank_account_usage WHERE usage_scope<>'selected_companies') THEN
   RAISE EXCEPTION 'Migration widened company scope';
 END IF;
 IF EXISTS(SELECT 1 FROM master.bank_account_company_usage WHERE accepted_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Migration inferred payment acceptance';
 END IF;
 IF EXISTS(SELECT 1 FROM master.bank_account_link l WHERE l.owner_type='business_partner' AND l.company_code_id IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM master.bank_account_company_usage u WHERE u.tenant_id=l.tenant_id AND u.bank_account_link_id=l.id AND u.company_code_id=l.company_code_id)) THEN
   RAISE EXCEPTION 'Migration lost legacy company assignments';
 END IF;
 IF EXISTS(SELECT 1 FROM master.bank_account_link l JOIN master.bank_account_usage u ON u.tenant_id=l.tenant_id AND u.bank_account_link_id=l.id
   WHERE l.owner_type='business_partner' AND l.company_code_id IS NULL AND u.usage_scope='all_authorized_companies') THEN
   RAISE EXCEPTION 'Unscoped accounts were widened';
 END IF;
 IF EXISTS(SELECT 1 FROM master.bank_account_company_usage u WHERE master.bank_account_company_ready(u.tenant_id,u.bank_account_link_id,u.company_code_id,u.purpose,CURRENT_DATE)) THEN
   RAISE EXCEPTION 'Availability incorrectly implies payment readiness';
 END IF;
END $$;

DO $$
DECLARE fixture master.bank_account_link; test_link uuid := gen_random_uuid();
BEGIN
 SELECT * INTO fixture FROM master.bank_account_link WHERE owner_type='business_partner' AND company_code_id IS NOT NULL LIMIT 1;
 IF fixture.id IS NULL THEN RAISE EXCEPTION 'Bank usage regression needs a partner bank fixture'; END IF;
 INSERT INTO master.bank_account_link(id,tenant_id,owner_type_id,owner_type,owner_id,relationship_role,bank_account_id,company_code_id,purpose,is_primary,created_by)
 VALUES(test_link,fixture.tenant_id,fixture.owner_type_id,fixture.owner_type,fixture.owner_id,fixture.relationship_role,fixture.bank_account_id,NULL,fixture.purpose,false,fixture.created_by);
 IF NOT EXISTS(SELECT 1 FROM master.bank_account_usage WHERE tenant_id=fixture.tenant_id AND bank_account_link_id=test_link AND usage_scope='selected_companies')
 OR EXISTS(SELECT 1 FROM master.bank_account_company_usage WHERE tenant_id=fixture.tenant_id AND bank_account_link_id=test_link)
 OR master.bank_account_company_eligible(fixture.tenant_id,test_link,fixture.company_code_id,CURRENT_DATE) THEN
  RAISE EXCEPTION 'New unscoped link acquired implicit company eligibility';
 END IF;
 UPDATE master.bank_account_usage SET usage_scope='all_authorized_companies' WHERE tenant_id=fixture.tenant_id AND bank_account_link_id=test_link;
 IF NOT master.bank_account_company_eligible(fixture.tenant_id,test_link,fixture.company_code_id,CURRENT_DATE)
 OR master.bank_account_company_ready(fixture.tenant_id,test_link,fixture.company_code_id,fixture.purpose,CURRENT_DATE) THEN
  RAISE EXCEPTION 'Universal availability and payment acceptance are not independent';
 END IF;
END $$;
