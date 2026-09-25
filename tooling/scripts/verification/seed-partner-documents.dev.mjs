/** Additive, zero-value CATL draft document fixtures. No approval, publication or payment. */
import {execFileSync} from 'node:child_process';
const mode=process.argv[2];
if(!['--rollback-dev','--apply-existing-dev'].includes(mode))throw Error('Explicit DEV mode required');
const container='athyper-dev-db-1';
if(execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',container],{encoding:'utf8'}).trim()!=='athyper-dev')throw Error('Not DEV');
const sql=`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';
DO $$ DECLARE tenant uuid:='44444444-4444-4444-8444-444444444444'; actor uuid; company master.company_code%ROWTYPE; b record; fixture_code text;
BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id=tenant AND code='catl.admin';
 SELECT * INTO STRICT company FROM master.company_code WHERE tenant_id=tenant AND code='catl' AND status='active';
 IF (SELECT count(*) FROM master.business_partner WHERE tenant_id=tenant AND code IN('BP-DEMO-CORE-001','BP-DEMO-PERSON-001'))<>2 THEN RAISE EXCEPTION 'Both CATL demo partners required'; END IF;
 PERFORM set_config('app.current_tenant_id',tenant::text,true);
 PERFORM set_config('app.current_principal_id',actor::text,true);
 FOR b IN SELECT id,code,name FROM master.business_partner WHERE tenant_id=tenant AND code IN('BP-DEMO-CORE-001','BP-DEMO-PERSON-001') LOOP
  fixture_code:=b.code||'-PO-DRAFT';
  INSERT INTO document.commitment(tenant_id,company_code_id,code,name,description,business_partner_id,requested_by,document_date,effective_date,currency_code,base_currency_code,total_amount,status,metadata,created_by)
  VALUES(tenant,company.id,fixture_code,'Demo draft — '||b.name,'Synthetic zero-value document reference; no purchase authorization',b.id,actor,CURRENT_DATE,CURRENT_DATE,company.functional_currency,company.functional_currency,0,'draft','{"fixture":"partner-owned-document.v1"}',actor)
  ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM document.commitment WHERE tenant_id=tenant AND company_code_id=company.id AND code=fixture_code AND business_partner_id=b.id AND metadata->>'fixture'='partner-owned-document.v1') THEN RAISE EXCEPTION 'Fixture coordinate already belongs to unrelated data'; END IF;
 END LOOP;
END $$;
${mode==='--apply-existing-dev'?'COMMIT':'ROLLBACK'};`;
try{
 execFileSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});
 console.log(mode==='--apply-existing-dev'?'Ensured two CATL BP-owned zero-value draft purchase documents; existing records unchanged.':'PASS: two partner document fixtures; rolled back.');
}catch(error){process.stderr.write(String(error.stderr??error.message));process.exitCode=1;}
