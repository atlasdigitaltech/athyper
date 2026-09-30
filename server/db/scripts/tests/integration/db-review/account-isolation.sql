BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO master.company_code(id,tenant_id,legal_entity_id,code,name,functional_currency,status,created_by) VALUES('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','foreign_company','Foreign tenant company','USD','active','d0000000-0000-4000-8000-000000000001');
INSERT INTO master.company_code_chart_assignment(tenant_id,company_code_id,chart_of_account_id,is_primary,created_by) VALUES('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001',true,'d0000000-0000-4000-8000-000000000001');
INSERT INTO master.gl_account(tenant_id,chart_of_account_id,code,name,account_class,normal_balance,status,created_by) VALUES('b0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','1000','Foreign cash account','asset','debit','active','d0000000-0000-4000-8000-000000000001');
SET LOCAL session_replication_role=origin;
REFRESH MATERIALIZED VIEW master.mv_company_postable_account;
SET LOCAL ROLE athyperapp;
SET LOCAL app.current_tenant_id='b0000000-0000-4000-8000-000000000002';
DO $$ BEGIN
 BEGIN
   PERFORM 1 FROM master.mv_company_postable_account;
   RAISE EXCEPTION 'Application retained direct cache access';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM master.v_company_postable_account) THEN
   RAISE EXCEPTION 'Accounting view leaked foreign tenant data';
 END IF;
END $$;
SET LOCAL app.current_tenant_id='b0000000-0000-4000-8000-000000000001';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM master.v_company_postable_account WHERE account_name='Foreign cash account') THEN
   RAISE EXCEPTION 'Accounting view lost same-tenant visibility';
 END IF;
END $$;
ROLLBACK;
