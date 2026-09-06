\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE tenant uuid; actor uuid; legal uuid:=gen_random_uuid(); company uuid:=gen_random_uuid(); org uuid:=gen_random_uuid();
BEGIN
 SELECT t.id,p.id INTO STRICT tenant,actor FROM master.tenant t JOIN master.principal p ON p.tenant_id=t.id WHERE t.code='system' AND p.code='systemadmin';
 PERFORM set_config('app.database_plane','neon',true);
 PERFORM set_config('app.current_tenant_id',tenant::text,true);
 PERFORM set_config('app.current_principal_id',actor::text,true);
 INSERT INTO master.legal_entity(id,tenant_id,code,name,legal_name,functional_currency,status,created_by) VALUES(legal,tenant,'r5.legal','R5 Legal','R5 Legal','MYR','active',actor);
 INSERT INTO master.company_code(id,tenant_id,legal_entity_id,code,name,functional_currency,status,created_by) VALUES(company,tenant,legal,'r5.company','R5 Company','MYR','active',actor);
 INSERT INTO master.operating_organization(id,tenant_id,code,name,domain,status,created_by) VALUES(org,tenant,'r5.sales','R5 Sales','sales','active',actor);
 INSERT INTO master.operating_organization_company_assignment(tenant_id,operating_organization_id,company_code_id,status,created_by) VALUES(tenant,org,company,'active',actor);
 INSERT INTO master.payment_term(tenant_id,code,name,due_days,status,created_by) VALUES(tenant,'R5.NET30','R5 Net 30',30,'draft',actor);
 UPDATE master.payment_term SET status='active',status_changed_at=clock_timestamp(),status_changed_by=actor,updated_by=actor WHERE tenant_id=tenant AND code='R5.NET30';
END $$;
COMMIT;
