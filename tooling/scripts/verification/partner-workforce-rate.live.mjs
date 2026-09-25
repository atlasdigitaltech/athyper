import {execFileSync} from 'node:child_process';
if(process.argv[2]!=='--rollback-dev')throw Error('Explicit --rollback-dev required');
const container='athyper-dev-db-1';
if(execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',container],{encoding:'utf8'}).trim()!=='athyper-dev')throw Error('Not DEV');
const sql=`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';
LOCK TABLE control.external_workforce_rate IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN IF current_database()<>'athyper_neon' OR EXISTS(SELECT 1 FROM control.external_workforce_rate) THEN RAISE EXCEPTION 'Expected empty rate table on existing DEV'; END IF; END $$;
ALTER TABLE control.external_workforce_rate DROP CONSTRAINT external_workforce_rate_supplier_fk;
ALTER TABLE control.external_workforce_rate RENAME COLUMN supplier_id TO business_partner_id;
ALTER TABLE control.external_workforce_rate ADD CONSTRAINT external_workforce_rate_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT;
DO $test$
DECLARE b master.business_partner%ROWTYPE; company uuid; card uuid; foreign_partner uuid;
BEGIN
 SELECT partner.* INTO STRICT b FROM master.business_partner partner WHERE status='active' AND EXISTS(SELECT 1 FROM master.company_code c WHERE c.tenant_id=partner.tenant_id) ORDER BY id LIMIT 1;
 SELECT id INTO STRICT company FROM master.company_code WHERE tenant_id=b.tenant_id ORDER BY id LIMIT 1;
 SELECT id INTO STRICT foreign_partner FROM master.business_partner WHERE tenant_id<>b.tenant_id ORDER BY id LIMIT 1;
 PERFORM set_config('app.current_tenant_id',b.tenant_id::text,true);
 PERFORM set_config('app.current_principal_id',b.created_by::text,true);
 INSERT INTO control.external_workforce_rate_card(tenant_id,company_code_id,code,name,currency_code,effective_from,created_by)
 VALUES(b.tenant_id,company,'BP-RATE-PROBE','Synthetic rate policy, not spend approval','USD','2026-01-01',b.created_by) RETURNING id INTO card;
 INSERT INTO control.external_workforce_rate(tenant_id,rate_card_id,business_partner_id,rate_code,unit_of_measure,regular_rate,effective_from,effective_until,created_by)
 VALUES(b.tenant_id,card,b.id,'RATE-A','hour',10,'2026-01-01','2026-06-01',b.created_by);
 BEGIN
  INSERT INTO control.external_workforce_rate(tenant_id,rate_card_id,business_partner_id,rate_code,unit_of_measure,regular_rate,effective_from,effective_until,created_by)
  VALUES(b.tenant_id,card,b.id,'RATE-B','hour',11,'2026-05-01','2026-07-01',b.created_by);
  RAISE EXCEPTION 'TEST: overlapping partner rate accepted';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
 INSERT INTO control.external_workforce_rate(tenant_id,rate_card_id,business_partner_id,rate_code,unit_of_measure,regular_rate,effective_from,effective_until,created_by)
 VALUES(b.tenant_id,card,b.id,'RATE-C','hour',12,'2026-06-01','2026-07-01',b.created_by);
 BEGIN
  INSERT INTO control.external_workforce_rate(tenant_id,rate_card_id,business_partner_id,rate_code,unit_of_measure,regular_rate,effective_from,created_by)
  VALUES(b.tenant_id,card,foreign_partner,'RATE-D','hour',10,'2026-01-01',b.created_by);
  RAISE EXCEPTION 'TEST: foreign tenant rate accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $test$; ROLLBACK;`;
try{execFileSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});console.log('PASS: BP-scoped rates, half-open adjacent dates, overlap denial and tenant isolation. All changes rolled back.');}
catch(error){process.stderr.write(String(error.stderr??error.message));process.exitCode=1;}
