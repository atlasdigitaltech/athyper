/** Additive Athyper draft-profile fixture; no activation, secrets, grants or reset. */
import {execFileSync} from 'node:child_process';
const mode=process.argv[2];if(!['--rollback-dev','--apply-existing-dev'].includes(mode))throw Error('Explicit mode required');
const container='athyper-dev-db-1';
if(execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',container],{encoding:'utf8'}).trim()!=='athyper-dev')throw Error('Not DEV');
const sql=`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';
DO $$ DECLARE tenant uuid:='11111111-1111-4111-8111-111111111111'; actor uuid; company uuid; currency character(3); term uuid; b record;
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=tenant AND code='athyper.admin';
 IF (SELECT count(*) FROM master.company_code WHERE tenant_id=tenant AND code IN ('amre','amre.ops','acfb') AND status='active')<>3 THEN RAISE EXCEPTION 'Expected three active demo companies'; END IF;
 IF (SELECT count(*) FROM master.business_partner WHERE tenant_id=tenant AND code IN('BP-DEMO-CORE-001','BP-DEMO-PERSON-001') AND metadata->>'_seed'='demo.business-partner-core.v1')<>2 THEN RAISE EXCEPTION 'Both existing Athyper demo partners required'; END IF;
 PERFORM set_config('app.current_tenant_id',tenant::text,true);
 PERFORM set_config('app.current_principal_id',actor::text,true);
 INSERT INTO master.payment_term(tenant_id,code,name,description,due_days,status,metadata,created_by)
 VALUES(tenant,'BP-DEMO-NET30','Demo net 30 days','Synthetic draft payment terms; not approved for transactions',30,'draft','{"fixture":"partner-owned-company-profile.v1"}',actor)
 ON CONFLICT DO NOTHING;
 SELECT id INTO STRICT term FROM master.payment_term WHERE tenant_id=tenant AND code='BP-DEMO-NET30' AND metadata->>'fixture'='partner-owned-company-profile.v1' AND status='draft';
 FOR company,currency IN SELECT id,functional_currency FROM master.company_code WHERE tenant_id=tenant AND code IN ('amre','amre.ops','acfb') AND status='active' LOOP
 FOR b IN SELECT id FROM master.business_partner WHERE tenant_id=tenant AND code IN('BP-DEMO-CORE-001','BP-DEMO-PERSON-001') LOOP
  INSERT INTO master.company_code_supplier_profile(tenant_id,business_partner_id,company_code_id,currency_code,status,metadata,created_by)
  VALUES(tenant,b.id,company,currency,'draft','{"fixture":"partner-owned-company-profile.v1","note":"Synthetic draft; not commercial authorization"}',actor)
  ON CONFLICT(tenant_id,business_partner_id,company_code_id) DO NOTHING;
  -- Fill only an unset field on our retained Draft fixtures. Preserve user edits.
  UPDATE master.company_code_supplier_profile SET payment_term_id=term,updated_by=actor
   WHERE tenant_id=tenant AND business_partner_id=b.id AND company_code_id=company
     AND metadata->>'fixture'='partner-owned-company-profile.v1' AND status='draft' AND payment_term_id IS NULL;
  INSERT INTO master.company_code_customer_profile(tenant_id,business_partner_id,company_code_id,currency_code,status,metadata,created_by)
  VALUES(tenant,b.id,company,currency,'draft','{"fixture":"partner-owned-company-profile.v1","note":"Synthetic draft; not commercial authorization"}',actor)
  ON CONFLICT(tenant_id,business_partner_id,company_code_id) DO NOTHING;
  UPDATE master.company_code_customer_profile SET payment_term_id=term,updated_by=actor
   WHERE tenant_id=tenant AND business_partner_id=b.id AND company_code_id=company
     AND metadata->>'fixture'='partner-owned-company-profile.v1' AND status='draft' AND payment_term_id IS NULL;
 END LOOP;
 END LOOP;
END $$;
${mode==='--rollback-dev'?'ROLLBACK':'COMMIT'};`;
try{execFileSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});console.log(mode==='--rollback-dev'?'PASS: Athyper draft-profile fixture; rolled back.':'Ensured twelve Athyper demo company profiles and a draft payment term; filled only unset payment terms on owned Draft fixtures. No capability or qualification enabled.');}
catch(error){process.stderr.write(String(error.stderr??error.message));process.exitCode=1;}
