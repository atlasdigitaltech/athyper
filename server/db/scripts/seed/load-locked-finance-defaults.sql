-- Locked catalog loader. Caller supplies tenant/principal settings and transaction.
-- Calendar policy: NONE (unadjusted contractual dates); no implied holiday calendar.
-- Loads profile identities only, without posting policies or supplier assignments.
DO $load$
DECLARE
 t uuid := nullif(current_setting('app.seed_tenant_id',true),'')::uuid;
 a uuid := nullif(current_setting('app.current_principal_id',true),'')::uuid;
 r record; p master.payment_term%ROWTYPE; ap master.accounting_profile%ROWTYPE;
 m jsonb := '{"_seed":{"pack":"locked-finance-defaults","version":"1.0.0"}}';
BEGIN
 IF current_database()<>'athyper_neon' OR t IS NULL OR a IS NULL THEN RAISE EXCEPTION 'Neon tenant and principal required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM master.tenant WHERE id=t AND status='active') OR NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=t AND id=a AND code='seed.three-plane-provisioner') THEN RAISE EXCEPTION 'Invalid tenant provisioning actor'; END IF;
 PERFORM set_config('app.current_tenant_id',t::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended('locked-finance-defaults:'||t::text,0));
 FOR r IN SELECT * FROM (VALUES
('PT-IMMEDIATE','Due on Invoice Date','BOTH','INVOICE_DATE','NET_DAYS',0,NULL,0,10),
('PT-COD','Payment on Delivery','BOTH','DELIVERY_DATE','COD',NULL,NULL,0,20),
('PT-PREPAID','Payment in Advance','PURCHASE','CONTRACT_DATE','PREPAID',NULL,NULL,0,30),
('PT-NET7','Net 7 Days','BOTH','INVOICE_DATE','NET_DAYS',7,NULL,0,40),
('PT-NET14','Net 14 Days','BOTH','INVOICE_DATE','NET_DAYS',14,NULL,0,50),
('PT-NET30','Net 30 Days','BOTH','INVOICE_DATE','NET_DAYS',30,NULL,0,60),
('PT-NET45','Net 45 Days','BOTH','INVOICE_DATE','NET_DAYS',45,NULL,0,70),
('PT-NET60','Net 60 Days','BOTH','INVOICE_DATE','NET_DAYS',60,NULL,0,80),
('PT-NET90','Net 90 Days','BOTH','INVOICE_DATE','NET_DAYS',90,NULL,0,90),
('PT-NET120','Net 120 Days','PURCHASE','INVOICE_DATE','NET_DAYS',120,NULL,0,100),
('PT-EOM','End of Invoice Month','BOTH','INVOICE_DATE','EOM',NULL,NULL,0,110),
('PT-EOM30','End of Invoice Month + 30 Days','BOTH','INVOICE_DATE','EOM',30,NULL,0,120),
('PT-EOM60','End of Invoice Month + 60 Days','BOTH','INVOICE_DATE','EOM',60,NULL,0,130),
('PT-FIXED1','1st of Following Month','BOTH','INVOICE_DATE','FIXED_DAY',NULL,1,1,140),
('PT-FIXED15','15th of Following Month','BOTH','INVOICE_DATE','FIXED_DAY',NULL,15,1,150),
('PT-EOMNEXT','End of Following Month','BOTH','INVOICE_DATE','EOM',NULL,NULL,1,160),
('PT-2-10-N30','2% Within 10 Days, Net 30','BOTH','INVOICE_DATE','NET_DAYS',30,NULL,0,170)
 ) AS v(code,name,applicable_to,base_event,due_rule_type,due_days,due_day,month_offset,sort_order)
 LOOP
 INSERT INTO master.payment_term(tenant_id,code,name,applicable_to,base_event,due_rule_type,due_days,due_day_of_month,month_offset,sort_order,business_day_convention,status,metadata,created_by)
 VALUES(t,r.code,r.name,r.applicable_to,r.base_event,r.due_rule_type,r.due_days,r.due_day,r.month_offset,r.sort_order,'NONE','draft',m,a)
 ON CONFLICT(tenant_id,code,version) DO NOTHING;
 SELECT * INTO STRICT p FROM master.payment_term WHERE tenant_id=t AND code=r.code AND version=1;
 IF ROW(p.name,p.applicable_to::text,p.base_event::text,p.due_rule_type::text,p.due_days::int,p.due_day_of_month::int,p.month_offset::int,p.business_day_convention::text,p.grace_days::int,p.due_date_flexibility::text,p.discount_selection_mode::text,p.metadata)
 IS DISTINCT FROM ROW(r.name,r.applicable_to,r.base_event,r.due_rule_type,r.due_days,r.due_day,r.month_offset,'NONE'::text,0,'FIXED'::text,'BEST_ELIGIBLE'::text,m) OR p.status NOT IN('draft','active') THEN RAISE EXCEPTION 'Existing term % differs from locked definition',r.code; END IF;
 IF r.code='PT-2-10-N30' THEN
 IF NOT EXISTS(SELECT 1 FROM master.payment_term_discount_tier WHERE tenant_id=t AND payment_term_id=p.id) THEN
 INSERT INTO master.payment_term_discount_tier(tenant_id,payment_term_id,tier_no,qualify_within_days,discount_pct,discount_basis_mode,metadata,created_by) VALUES(t,p.id,1,10,2,'GROSS',m,a);
 END IF;
 IF (SELECT count(*) FROM master.payment_term_discount_tier WHERE tenant_id=t AND payment_term_id=p.id)<>1 OR NOT EXISTS(SELECT 1 FROM master.payment_term_discount_tier WHERE tenant_id=t AND payment_term_id=p.id AND tier_no=1 AND qualify_within_days=10 AND discount_pct=2 AND discount_fixed IS NULL AND discount_basis_mode='GROSS' AND min_invoice_amount IS NULL) THEN RAISE EXCEPTION 'Discount definition conflict'; END IF;
 ELSIF EXISTS(SELECT 1 FROM master.payment_term_discount_tier WHERE tenant_id=t AND payment_term_id=p.id) THEN RAISE EXCEPTION 'Unexpected discount for %',r.code;
 END IF;
 IF EXISTS(SELECT 1 FROM master.payment_term_clause WHERE tenant_id=t AND payment_term_id=p.id) THEN RAISE EXCEPTION 'Unexpected clauses for %',r.code; END IF;
 PERFORM master.assert_payment_term_aggregate_valid(t,p.id);
 UPDATE master.payment_term SET status='active',status_changed_at=clock_timestamp(),status_changed_by=a,updated_at=clock_timestamp(),updated_by=a WHERE id=p.id AND tenant_id=t AND status='draft';
 END LOOP;
 FOR r IN SELECT * FROM (VALUES('ACP-AP-STANDARD','Standard Supplier Accounting','INBOUND','AP'),('ACP-AR-STANDARD','Standard Customer Accounting','OUTBOUND','AR'))v(code,name,direction,subledger)
 LOOP
 INSERT INTO master.accounting_profile(tenant_id,code,name,direction,subledger_type,status,metadata,created_by) VALUES(t,r.code,r.name,r.direction,r.subledger,'active',m,a) ON CONFLICT(tenant_id,code) DO NOTHING;
 SELECT * INTO STRICT ap FROM master.accounting_profile WHERE tenant_id=t AND code=r.code;
 IF ROW(ap.name,ap.direction::text,ap.subledger_type::text,ap.status::text,ap.metadata) IS DISTINCT FROM ROW(r.name,r.direction,r.subledger,'active'::text,m) THEN RAISE EXCEPTION 'Accounting profile % differs from locked definition',r.code; END IF;
 END LOOP;
END $load$;
