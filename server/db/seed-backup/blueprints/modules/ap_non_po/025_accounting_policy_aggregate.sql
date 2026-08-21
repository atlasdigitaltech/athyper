-- seed-contract-version: 1
-- seed-pack: neon.blueprint.ap-non-po
-- seed-pack-version: 2.0.0
-- seed-dataset: control.ap-non-po-accounting-policy-aggregate
-- seed-data-class: production_reference
-- seed-plane: neon
-- seed-tenant-scope: tenant
-- seed-natural-key: control.accounting_profile_policy(tenant_id,accounting_profile_id,effective_from)
-- seed-id-strategy: deterministic-uuid:athyper-wave5-ap-non-po-v2
-- seed-expected-row-count: exact:4-policies,9-events,18-entries
-- seed-assertions: expected-count,orphan,uniqueness,semantic,idempotent-convergence
-- seed-demo-data: false

DO $seed$
DECLARE v_tid uuid:=nullif(trim(current_setting('app.seed_tenant_id',true)),'')::uuid;
        v_actor uuid:=nullif(trim(current_setting('app.current_principal_id',true)),'')::uuid;
BEGIN
 IF current_setting('app.database_plane',true)<>'neon' OR v_tid IS NULL OR v_actor IS NULL THEN RAISE EXCEPTION '[ap-non-po] Neon tenant and actor scope required'; END IF;

 WITH profiles(code) AS (VALUES ('AP_NON_PO_STANDARD'),('AP_NON_PO_CAPEX'),('AP_ADVANCE_SUPPLIER'),('AP_RETENTION_RELEASE'))
 INSERT INTO control.accounting_profile_policy(id,tenant_id,accounting_profile_id,effective_from,metadata,status,created_by)
 SELECT md5('wave5:ap-non-po:policy:'||v_tid||':'||p.code)::uuid,v_tid,a.id,DATE '2026-01-01',
   jsonb_build_object('_seed',jsonb_build_object('pack','ap-non-po','version','2.0.0')),'draft',v_actor
 FROM profiles p JOIN master.accounting_profile a ON a.tenant_id=v_tid AND a.code=p.code AND a.status='active'
 WHERE NOT EXISTS (SELECT 1 FROM control.accounting_profile_policy existing
   WHERE existing.tenant_id=v_tid AND existing.accounting_profile_id=a.id AND existing.effective_from=DATE '2026-01-01')
 ON CONFLICT(tenant_id,accounting_profile_id,effective_from) DO NOTHING;

 WITH events(profile_code,event_code,action,sequence_no,description) AS (VALUES
  ('AP_NON_PO_STANDARD','INVOICE_RECEIVED','none',10,'Invoice captured; no journal'),
  ('AP_NON_PO_STANDARD','ORDER_APPROVAL','post',20,'Approved operating invoice'),
  ('AP_NON_PO_STANDARD','SETTLEMENT','post',30,'Supplier settlement'),
  ('AP_NON_PO_CAPEX','INVOICE_RECEIVED','none',10,'Capital invoice captured; no journal'),
  ('AP_NON_PO_CAPEX','ORDER_APPROVAL','post',20,'Approved capital invoice'),
  ('AP_NON_PO_CAPEX','SETTLEMENT','post',30,'Capital supplier settlement'),
  ('AP_ADVANCE_SUPPLIER','ADVANCE_PAID','post',10,'Supplier advance paid'),
  ('AP_ADVANCE_SUPPLIER','ADVANCE_RECOVERED','post',20,'Supplier advance recovered'),
  ('AP_RETENTION_RELEASE','RETENTION_RELEASED','post',10,'Supplier retention released'))
 INSERT INTO control.accounting_profile_event(id,tenant_id,accounting_profile_policy_id,event_code,journal_action,sequence_no,metadata,created_by)
 SELECT md5('wave5:ap-non-po:event:'||v_tid||':'||e.profile_code||':'||e.event_code)::uuid,v_tid,p.id,e.event_code,
   e.action::control.accounting_journal_action_d,e.sequence_no,jsonb_build_object('description',e.description),v_actor
 FROM events e JOIN master.accounting_profile a ON a.tenant_id=v_tid AND a.code=e.profile_code
 JOIN control.accounting_profile_policy p ON p.tenant_id=v_tid AND p.accounting_profile_id=a.id AND p.effective_from=DATE '2026-01-01'
 WHERE NOT EXISTS (SELECT 1 FROM control.accounting_profile_event existing
   WHERE existing.tenant_id=v_tid AND existing.accounting_profile_policy_id=p.id AND existing.event_code=e.event_code)
 ON CONFLICT(tenant_id,accounting_profile_policy_id,event_code) DO NOTHING;

 WITH entries(profile_code,event_code,line_no,description,side,role_code,amount_source,balancing) AS (VALUES
  ('AP_NON_PO_STANDARD','ORDER_APPROVAL',10,'Debit intent-determined expense','debit','payment_suspense','line_net',false),
  ('AP_NON_PO_STANDARD','ORDER_APPROVAL',20,'Debit recoverable input tax','debit','input_tax_recoverable','tax_amount',false),
  ('AP_NON_PO_STANDARD','ORDER_APPROVAL',30,'Credit withholding tax','credit','wht_payable','withholding_amount',false),
  ('AP_NON_PO_STANDARD','ORDER_APPROVAL',40,'Credit AP trade payable','credit','ap_trade_payable','remainder',true),
  ('AP_NON_PO_STANDARD','SETTLEMENT',10,'Debit AP trade payable','debit','ap_trade_payable','net_payable',false),
  ('AP_NON_PO_STANDARD','SETTLEMENT',20,'Credit AP clearing','credit','ap_clearing','remainder',true),
  ('AP_NON_PO_CAPEX','ORDER_APPROVAL',10,'Debit capital work in progress','debit','fa_cwip','line_net',false),
  ('AP_NON_PO_CAPEX','ORDER_APPROVAL',20,'Debit recoverable input tax','debit','input_tax_recoverable','tax_amount',false),
  ('AP_NON_PO_CAPEX','ORDER_APPROVAL',30,'Credit withholding tax','credit','wht_payable','withholding_amount',false),
  ('AP_NON_PO_CAPEX','ORDER_APPROVAL',40,'Credit AP trade payable','credit','ap_trade_payable','remainder',true),
  ('AP_NON_PO_CAPEX','SETTLEMENT',10,'Debit AP trade payable','debit','ap_trade_payable','net_payable',false),
  ('AP_NON_PO_CAPEX','SETTLEMENT',20,'Credit AP clearing','credit','ap_clearing','remainder',true),
  ('AP_ADVANCE_SUPPLIER','ADVANCE_PAID',10,'Debit supplier advance','debit','ap_advance_recovery','advance_amount',false),
  ('AP_ADVANCE_SUPPLIER','ADVANCE_PAID',20,'Credit AP clearing','credit','ap_clearing','remainder',true),
  ('AP_ADVANCE_SUPPLIER','ADVANCE_RECOVERED',10,'Debit AP trade payable','debit','ap_trade_payable','advance_recovery',false),
  ('AP_ADVANCE_SUPPLIER','ADVANCE_RECOVERED',20,'Credit supplier advance','credit','ap_advance_recovery','remainder',true),
  ('AP_RETENTION_RELEASE','RETENTION_RELEASED',10,'Debit AP retention payable','debit','ap_retention_payable','retention_amount',false),
  ('AP_RETENTION_RELEASE','RETENTION_RELEASED',20,'Credit AP clearing','credit','ap_clearing','remainder',true))
 INSERT INTO control.accounting_profile_entry(id,tenant_id,accounting_profile_event_id,line_no,description,posting_side,posting_role_code,amount_source,is_balancing_line,metadata,created_by)
 SELECT md5('wave5:ap-non-po:entry:'||v_tid||':'||x.profile_code||':'||x.event_code||':'||x.line_no)::uuid,v_tid,e.id,x.line_no,
   x.description,x.side::control.accounting_posting_side_d,x.role_code,x.amount_source::control.accounting_amount_source_d,x.balancing,
   CASE WHEN x.role_code='payment_suspense' THEN '{"resolution":"business_intent_posting_role"}'::jsonb ELSE '{}'::jsonb END,v_actor
 FROM entries x JOIN master.accounting_profile a ON a.tenant_id=v_tid AND a.code=x.profile_code
 JOIN control.accounting_profile_policy p ON p.tenant_id=v_tid AND p.accounting_profile_id=a.id AND p.effective_from=DATE '2026-01-01'
 JOIN control.accounting_profile_event e ON e.tenant_id=v_tid AND e.accounting_profile_policy_id=p.id AND e.event_code=x.event_code
 WHERE NOT EXISTS (SELECT 1 FROM control.accounting_profile_entry existing
   WHERE existing.tenant_id=v_tid AND existing.accounting_profile_event_id=e.id AND existing.line_no=x.line_no)
 ON CONFLICT(tenant_id,accounting_profile_event_id,line_no) DO NOTHING;

 UPDATE control.accounting_profile_policy SET status='active',status_changed_at=now(),status_changed_by=v_actor
 WHERE tenant_id=v_tid AND effective_from=DATE '2026-01-01' AND status='draft'
   AND metadata->'_seed'->>'pack'='ap-non-po';

 WITH routes(intent_code,flow_code,document_type_code,profile_code) AS (VALUES
  ('BI-OPEX','NON_PO','STANDARD','AP_NON_PO_STANDARD'),
  ('BI-ADMIN','NON_PO','STANDARD','AP_NON_PO_STANDARD'),
  ('BI-OPEX','NON_PO','CREDIT_NOTE','AP_NON_PO_STANDARD'),
  ('BI-CAPEX','NON_PO','STANDARD','AP_NON_PO_CAPEX'),
  ('BI-OPEX',NULL,'ADVANCE','AP_ADVANCE_SUPPLIER'),
  ('BI-OPEX',NULL,'RETENTION_RELEASE','AP_RETENTION_RELEASE'))
 INSERT INTO control.accounting_profile_assignment(id,tenant_id,business_intent_id,flow_code,document_type_code,
   accounting_profile_policy_id,effective_from,metadata,status,created_by)
 SELECT md5('wave5:ap-non-po:assignment:'||v_tid||':'||r.intent_code||':'||coalesce(r.flow_code,'*')||':'||r.document_type_code)::uuid,
   v_tid,i.id,r.flow_code,r.document_type_code,p.id,DATE '2026-01-01',
   jsonb_build_object('_seed',jsonb_build_object('pack','ap-non-po','version','2.0.0')),'draft',v_actor
 FROM routes r JOIN master.business_intent i ON i.tenant_id=v_tid AND i.code=r.intent_code
 JOIN master.accounting_profile a ON a.tenant_id=v_tid AND a.code=r.profile_code
 JOIN control.accounting_profile_policy p ON p.tenant_id=v_tid AND p.accounting_profile_id=a.id AND p.effective_from=DATE '2026-01-01'
 WHERE NOT EXISTS (SELECT 1 FROM control.accounting_profile_assignment existing
   WHERE existing.tenant_id=v_tid AND existing.company_code_id IS NULL
     AND existing.business_intent_id=i.id AND existing.flow_code IS NOT DISTINCT FROM r.flow_code
     AND existing.document_type_code=r.document_type_code AND existing.effective_from=DATE '2026-01-01')
 ON CONFLICT(tenant_id,company_code_id,business_intent_id,flow_code,document_type_code,effective_from) DO UPDATE SET
   accounting_profile_policy_id=excluded.accounting_profile_policy_id,metadata=excluded.metadata,updated_at=now(),updated_by=v_actor
 WHERE (control.accounting_profile_assignment.accounting_profile_policy_id,
        control.accounting_profile_assignment.metadata)
   IS DISTINCT FROM (excluded.accounting_profile_policy_id,excluded.metadata);

 UPDATE control.accounting_profile_assignment SET status='active',status_changed_at=now(),status_changed_by=v_actor
 WHERE tenant_id=v_tid AND effective_from=DATE '2026-01-01' AND status='draft'
   AND metadata->'_seed'->>'pack'='ap-non-po';
 IF (SELECT count(*) FROM control.accounting_profile_policy WHERE tenant_id=v_tid AND metadata->'_seed'->>'pack'='ap-non-po')<>4
 OR (SELECT count(*) FROM control.accounting_profile_event e JOIN control.accounting_profile_policy p ON p.id=e.accounting_profile_policy_id AND p.tenant_id=e.tenant_id WHERE p.tenant_id=v_tid AND p.metadata->'_seed'->>'pack'='ap-non-po')<>9
 OR (SELECT count(*) FROM control.accounting_profile_entry l JOIN control.accounting_profile_event e ON e.id=l.accounting_profile_event_id AND e.tenant_id=l.tenant_id JOIN control.accounting_profile_policy p ON p.id=e.accounting_profile_policy_id AND p.tenant_id=e.tenant_id WHERE p.tenant_id=v_tid AND p.metadata->'_seed'->>'pack'='ap-non-po')<>18 THEN
   RAISE EXCEPTION '[ap-non-po] accounting aggregate count mismatch';
 END IF;
END $seed$;
