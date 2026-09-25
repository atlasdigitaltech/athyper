-- Synthetic references only. Execute inside the caller's rollback transaction.
-- Direct SQL proves storage integrity, not business authorization or release eligibility.
DO $test$
DECLARE b master.business_partner%ROWTYPE; c master.company_code%ROWTYPE;
 period_id uuid; foreign_partner uuid; other_partner uuid; commitment_id uuid; requisition_id uuid; distribution_id uuid;
BEGIN
 SELECT p.* INTO STRICT b FROM master.business_partner p
 WHERE p.status='active' AND NOT EXISTS(SELECT 1 FROM master.supplier s WHERE s.tenant_id=p.tenant_id AND s.business_partner_id=p.id)
 AND EXISTS(SELECT 1 FROM master.fiscal_period f WHERE f.tenant_id=p.tenant_id) ORDER BY p.id LIMIT 1;
 SELECT company.* INTO STRICT c FROM master.company_code company
 WHERE company.tenant_id=b.tenant_id AND EXISTS(SELECT 1 FROM master.fiscal_period f WHERE f.tenant_id=company.tenant_id AND f.company_code_id=company.id)
 ORDER BY company.id LIMIT 1;
 SELECT id INTO STRICT period_id FROM master.fiscal_period WHERE tenant_id=b.tenant_id AND company_code_id=c.id ORDER BY id LIMIT 1;
 SELECT id INTO STRICT foreign_partner FROM master.business_partner WHERE tenant_id<>b.tenant_id ORDER BY id LIMIT 1;
 SELECT id INTO STRICT other_partner FROM master.business_partner WHERE tenant_id=b.tenant_id AND id<>b.id ORDER BY id LIMIT 1;
 PERFORM set_config('app.current_tenant_id',b.tenant_id::text,true);
 PERFORM set_config('app.current_principal_id',b.created_by::text,true);
 INSERT INTO document.commitment(tenant_id,company_code_id,code,name,business_partner_id,requested_by,document_date,effective_date,currency_code,base_currency_code,created_by)
 VALUES(b.tenant_id,c.id,'BP-REFERENCE-PROBE','Synthetic partner reference',b.id,b.created_by,CURRENT_DATE,CURRENT_DATE,'USD','USD',b.created_by) RETURNING id INTO commitment_id;
 INSERT INTO document.purchase_invoice(tenant_id,company_code_id,code,name,business_partner_id,commitment_id,supplier_invoice_number,supplier_invoice_date,currency_code,base_currency_code,fiscal_period_id,requested_by,created_by)
 VALUES(b.tenant_id,c.id,'BP-REFERENCE-PROBE','Synthetic invoice',b.id,commitment_id,'DEMO-ONLY',CURRENT_DATE,'USD','USD',period_id,b.created_by,b.created_by);
 INSERT INTO document.payment_entry(tenant_id,company_code_id,payment_number,business_partner_id,supplier_name_snapshot,payment_method_code,currency_code,base_currency_code,payment_amount,base_amount,fiscal_period_id,created_by)
 VALUES(b.tenant_id,c.id,'BP-REFERENCE-PROBE',b.id,'Synthetic; not for payment','bank_transfer','USD','USD',1,1,period_id,b.created_by);
 INSERT INTO document.workforce_requisition(tenant_id,company_code_id,legal_entity_id,code,name,expected_start_date,currency_code,created_by)
 VALUES(b.tenant_id,c.id,c.legal_entity_id,'BP-REFERENCE-PROBE','Synthetic workforce reference',CURRENT_DATE,'USD',b.created_by) RETURNING id INTO requisition_id;
 INSERT INTO document.workforce_requisition_supplier(tenant_id,workforce_requisition_id,business_partner_id,distributed_at,distributed_by,created_by)
 VALUES(b.tenant_id,requisition_id,b.id,now(),b.created_by,b.created_by) RETURNING id INTO distribution_id;
 INSERT INTO document.external_candidate_submission(tenant_id,workforce_requisition_id,requisition_supplier_id,business_partner_id,candidate_reference_hash,currency_code,submitted_at,submitted_by,created_by)
 VALUES(b.tenant_id,requisition_id,distribution_id,b.id,repeat('a',64),'USD',now(),b.created_by,b.created_by);
 BEGIN
  UPDATE document.commitment SET business_partner_id=foreign_partner WHERE id=commitment_id;
  RAISE EXCEPTION 'TEST: cross-tenant purchase partner accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  UPDATE document.payment_entry SET business_partner_id=shared.uuidv7() WHERE tenant_id=b.tenant_id AND payment_number='BP-REFERENCE-PROBE';
  RAISE EXCEPTION 'TEST: missing payment partner accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  INSERT INTO document.external_candidate_submission(tenant_id,workforce_requisition_id,requisition_supplier_id,business_partner_id,candidate_reference_hash,currency_code,submitted_at,submitted_by,created_by)
  VALUES(b.tenant_id,requisition_id,distribution_id,other_partner,repeat('b',64),'USD',now(),b.created_by,b.created_by);
  RAISE EXCEPTION 'TEST: mismatched distribution partner accepted';
 EXCEPTION WHEN integrity_constraint_violation THEN
  IF SQLERRM NOT LIKE 'Candidate submission must use an open distribution%' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO document.workforce_requisition_supplier(tenant_id,workforce_requisition_id,business_partner_id,distributed_at,distributed_by,created_by)
  VALUES(b.tenant_id,requisition_id,foreign_partner,now(),b.created_by,b.created_by);
  RAISE EXCEPTION 'TEST: cross-tenant workforce partner accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $test$;
