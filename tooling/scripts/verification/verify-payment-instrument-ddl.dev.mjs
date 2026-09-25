import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const base='server/db/ddl/planes/neon/master/';
const read=n=>fs.readFileSync(base+n,'utf8');
const tables=read('03_tables.sql');
const table=name=>{
 const result=tables.match(new RegExp('CREATE TABLE master\\.'+name+' \\([\\s\\S]*?\\n\\);'));
 if(!result)throw Error(`Missing canonical table ${name}`);
 return result[0];
};
const functionSql=name=>{
 const result=read('07_functions.sql').match(new RegExp('CREATE (?:OR REPLACE )?FUNCTION master\\.'+name+'\\([\\s\\S]*?\\$\\$;'));
 if(!result)throw Error(`Missing canonical function ${name}`);
 return result[0];
};
// Transaction-local validation in the existing DEV database. No extra instance,
// database, persistent schema, demo changes or backup is created.
let ddl=[table('payment_instrument'),table('bank_account'),table('payment_instrument_link'),
 read('14_payment_instrument_integrity.sql').replace(/COMMENT ON COLUMN master\.bank_account_house_config[\s\S]*?';/,''),
 functionSql('trg_normalize_bank_account'),functionSql('trg_guard_bank_account_identity'),
 functionSql('trg_guard_payment_instrument_link_identity'),
 `CREATE TRIGGER normalize BEFORE INSERT OR UPDATE ON master.bank_account FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_bank_account();
 CREATE TRIGGER identity_guard BEFORE UPDATE ON master.bank_account FOR EACH ROW EXECUTE FUNCTION master.trg_guard_bank_account_identity();
 ALTER TABLE master.payment_instrument_link ADD FOREIGN KEY(tenant_id,payment_instrument_id) REFERENCES master.payment_instrument(tenant_id,id);`
].join('\n');
for(const name of ['payment_instrument_link','payment_instrument','bank_account','guard_payment_instrument_identity','require_payment_instrument_subtype','trg_normalize_bank_account','trg_guard_bank_account_identity','trg_guard_payment_instrument_link_identity']){
 ddl=ddl.replace(new RegExp('master\\.'+name+'\\b','g'),'bp_ddl_check.'+name);
}
const sql=`BEGIN;
SET LOCAL lock_timeout='3s';
CREATE SCHEMA bp_ddl_check;
${ddl}
DO $$
DECLARE t uuid; actor uuid; instrument uuid:=shared.uuidv7(); provisional uuid; owner_kind uuid; bp uuid;
BEGIN
 SELECT tenant_id,id INTO t,bp FROM master.business_partner WHERE code='BP-DEMO-CORE-001' LIMIT 1;
 IF t IS NULL THEN RAISE EXCEPTION 'Main DEV BP demo is required'; END IF;
 SELECT created_by INTO actor FROM master.business_partner WHERE id=bp;
 SELECT id INTO owner_kind FROM control.owner_type WHERE code='business_partner' AND tenant_id IS NULL LIMIT 1;
 INSERT INTO master.bank_provisional_reference(tenant_id,submitted_name,submitted_country)
 VALUES(t,'DDL transaction-only test bank','GB') RETURNING id INTO provisional;
 INSERT INTO bp_ddl_check.payment_instrument(id,tenant_id,instrument_type_code,name,created_by)
 VALUES(instrument,t,'bank_account','DDL test',actor);
 INSERT INTO bp_ddl_check.bank_account(id,tenant_id,provisional_bank_reference_id,account_holder_name,
 account_id_type,account_id_value,account_last4,currency_code,created_by)
 VALUES(instrument,t,provisional,'Demo','local','DEMO00001234','1234','GBP',actor);
 SET CONSTRAINTS ALL IMMEDIATE;
 INSERT INTO bp_ddl_check.payment_instrument_link(tenant_id,owner_type_id,owner_type,owner_id,
 relationship_role,payment_instrument_id,created_by)
 VALUES(t,owner_kind,'business_partner',bp,'beneficiary',instrument,actor);
 BEGIN
  UPDATE bp_ddl_check.bank_account SET account_id_value='DEMO00005678' WHERE id=instrument;
  RAISE EXCEPTION 'Linked account mutation incorrectly allowed';
 EXCEPTION WHEN check_violation OR integrity_constraint_violation THEN NULL; END;
 BEGIN
  INSERT INTO bp_ddl_check.payment_instrument(tenant_id,instrument_type_code,created_by)
  VALUES(t,'card',actor);
  RAISE EXCEPTION 'Future instrument incorrectly enabled';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO bp_ddl_check.payment_instrument(tenant_id,instrument_type_code,created_by)
  VALUES(t,'bank_account',actor);
  RAISE EXCEPTION 'Instrument without bank detail incorrectly allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO bp_ddl_check.bank_account(id,tenant_id,provisional_bank_reference_id,account_holder_name,
  account_id_type,account_id_value,account_last4,currency_code,created_by)
  VALUES(shared.uuidv7(),t,provisional,'Demo','local','DEMO00001234','1234','GBP',actor);
  RAISE EXCEPTION 'Bank without instrument incorrectly allowed';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 RAISE NOTICE 'PAYMENT_INSTRUMENT_DDL_CORE_OK';
END $$;
ROLLBACK;
`;
const r=spawnSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d','athyper_neon','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');process.exit(r.status??1);
