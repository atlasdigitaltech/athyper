-- Synthetic draft document; caller must run inside a rollback-only transaction.
DO $test$
DECLARE b master.business_partner%ROWTYPE; company uuid; other_partner uuid; order_id uuid;
BEGIN
 SELECT p.* INTO STRICT b FROM master.business_partner p
 WHERE p.status='active'
   AND NOT EXISTS(SELECT 1 FROM master.customer c WHERE c.tenant_id=p.tenant_id AND c.business_partner_id=p.id)
   AND EXISTS(SELECT 1 FROM master.company_code c WHERE c.tenant_id=p.tenant_id)
 ORDER BY p.id LIMIT 1;
 SELECT id INTO STRICT company FROM master.company_code WHERE tenant_id=b.tenant_id ORDER BY id LIMIT 1;
 SELECT id INTO STRICT other_partner FROM master.business_partner WHERE tenant_id<>b.tenant_id ORDER BY id LIMIT 1;
 PERFORM set_config('app.current_tenant_id',b.tenant_id::text,true);
 PERFORM set_config('app.current_principal_id',b.created_by::text,true);
 INSERT INTO document.sales_order(tenant_id,company_code_id,business_partner_id,code,order_date,currency_code,created_by)
 VALUES(b.tenant_id,company,b.id,'CAPABILITY-REFERENCE-PROBE',CURRENT_DATE,'USD',b.created_by)
 RETURNING id INTO order_id;
 IF NOT EXISTS(SELECT 1 FROM document.sales_order WHERE id=order_id AND business_partner_id=b.id AND status='draft') THEN
   RAISE EXCEPTION 'TEST: draft sales order did not preserve partner identity'; END IF;
 BEGIN
   INSERT INTO document.sales_order(tenant_id,company_code_id,business_partner_id,code,order_date,currency_code,created_by)
   VALUES(b.tenant_id,company,other_partner,'CAPABILITY-CROSS-TENANT',CURRENT_DATE,'USD',b.created_by);
   RAISE EXCEPTION 'TEST: cross-tenant partner accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
   INSERT INTO document.sales_order(tenant_id,company_code_id,business_partner_id,code,order_date,currency_code,created_by)
   VALUES(b.tenant_id,company,shared.uuidv7(),'CAPABILITY-MISSING',CURRENT_DATE,'USD',b.created_by);
   RAISE EXCEPTION 'TEST: missing partner accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $test$;
