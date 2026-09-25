import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const base='server/db/ddl/planes/neon/control/';
const tables=fs.readFileSync(base+'03_tables.sql','utf8');
const functions=fs.readFileSync(base+'07_functions.sql','utf8');
const names=['business_partner_qualification','business_partner_block','business_partner_decision_scope'];
const copied=['trg_guard_business_partner_block','trg_validate_business_partner_control_lookup'];
const helpers=['guard_partner_decision_scope_owner','assert_partner_decision_coverage','require_partner_decision_coverage','assemble_partner_decision'];
let ddl=names.map(n=>tables.match(new RegExp('CREATE TABLE control\\.'+n+' \\([\\s\\S]*?\\n\\);'))[0]).join('\n');
ddl+='\n'+copied.map(n=>functions.match(new RegExp('CREATE OR REPLACE FUNCTION control\\.'+n+'\\([\\s\\S]*?\\$\\$;'))[0]).join('\n');
ddl+='\n'+fs.readFileSync(base+'18_partner_decision_contract.sql','utf8');
ddl+=`\nCREATE TRIGGER block_10_lookup BEFORE INSERT OR UPDATE OF operation_codes ON control.business_partner_block FOR EACH ROW EXECUTE FUNCTION control.trg_validate_business_partner_control_lookup('operation');
CREATE TRIGGER block_40_guard BEFORE INSERT OR UPDATE ON control.business_partner_block FOR EACH ROW EXECUTE FUNCTION control.trg_guard_business_partner_block();`;
for(const n of [...names,...copied,...helpers])ddl=ddl.replace(new RegExp('control\\.'+n+'\\b','g'),'bp_decision_check.'+n);
const sql=`BEGIN;
SET LOCAL lock_timeout='3s';
CREATE SCHEMA bp_decision_check;
${ddl}
DO $$
DECLARE t uuid; actor uuid; bp uuid; q uuid; b uuid; action text; qualification_type text; scopes jsonb; foreign_classification uuid;
BEGIN
 SELECT tenant_id,id,created_by INTO t,bp,actor FROM master.business_partner WHERE code='BP-DEMO-CORE-001' LIMIT 1;
 IF t IS NULL THEN RAISE EXCEPTION 'Main DEV demo is required'; END IF;
 PERFORM set_config('app.current_tenant_id',t::text,true);
 PERFORM set_config('app.current_principal_id',actor::text,true);
 SELECT code INTO action FROM control.lookup_value WHERE domain_code='control.business_partner_block_operation' AND status='active' LIMIT 1;
 SELECT code INTO qualification_type FROM control.lookup_value WHERE domain_code='control.business_partner_qualification_type' AND status='active' LIMIT 1;
 scopes:='[{"kind":"commercial_capacity","selection":"all"},{"kind":"operating_organization","selection":"all"},{"kind":"company_code","selection":"all"},{"kind":"commodity_category","selection":"all"},{"kind":"country","selection":"all","countryPurpose":"delivery"}]';
 q:=bp_decision_check.assemble_partner_decision(t,bp,'qualification',jsonb_build_object('qualificationTypeCode',qualification_type,'idempotencyKey','ddl-check-qualification'),scopes,actor);
 b:=bp_decision_check.assemble_partner_decision(t,bp,'restriction',jsonb_build_object('operationCodes',jsonb_build_array(action,upper(action)),'reason','DDL test'),scopes,actor);
 SET CONSTRAINTS ALL IMMEDIATE;
 IF NOT EXISTS(SELECT 1 FROM bp_decision_check.business_partner_block WHERE id=b AND scope_sealed AND cardinality(operation_codes)=1) THEN RAISE EXCEPTION 'Block not sealed/canonical'; END IF;
 BEGIN
  UPDATE bp_decision_check.business_partner_block SET scope_sealed=false WHERE id=b;
  RAISE EXCEPTION 'Unsealing incorrectly allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  DELETE FROM bp_decision_check.business_partner_decision_scope WHERE block_id=b;
  RAISE EXCEPTION 'Sealed scope deletion incorrectly allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE bp_decision_check.business_partner_decision_scope SET effective_from=CURRENT_DATE WHERE qualification_id=q;
  RAISE EXCEPTION 'Duplicate scope validity incorrectly allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE bp_decision_check.business_partner_decision_scope SET country_purpose=NULL WHERE qualification_id=q AND scope_kind='country';
  RAISE EXCEPTION 'Country without purpose incorrectly allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 SELECT id INTO foreign_classification FROM master.business_partner_commodity_classification WHERE tenant_id<>t LIMIT 1;
 IF foreign_classification IS NULL THEN RAISE EXCEPTION 'Three-tenant classification demo required'; END IF;
 BEGIN
  UPDATE bp_decision_check.business_partner_decision_scope
   SET scope_kind='commodity_classification',selection_mode='selected',commodity_classification_id=foreign_classification
   WHERE qualification_id=q AND scope_kind='commodity_category';
  RAISE EXCEPTION 'Foreign partner/tenant classification incorrectly admitted';
 EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END;
 BEGIN
  DELETE FROM bp_decision_check.business_partner_decision_scope WHERE qualification_id=q AND scope_kind='company_code';
  RAISE EXCEPTION 'Incomplete coverage incorrectly allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF has_function_privilege('athyperapp','bp_decision_check.assemble_partner_decision(uuid,uuid,text,jsonb,jsonb,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Internal assembly exposed without API permission review'; END IF;
 RAISE NOTICE 'PARTNER_DECISION_DDL_CORE_OK';
END $$;
ROLLBACK;
`;
const r=spawnSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');process.exit(r.status??1);
