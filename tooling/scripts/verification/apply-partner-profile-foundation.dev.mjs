/** Existing DEV only. Additive compatibility window; never aliases BP IDs as role IDs. */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const mode=process.argv[2];
if(!['--rollback-dev','--apply-existing-dev'].includes(mode))throw Error('Explicit mode required');
const container='athyper-dev-db-1';
if(execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',container],{encoding:'utf8'}).trim()!=='athyper-dev')throw Error('Not DEV');
const read=path=>readFileSync(new URL('../../../server/db/ddl/planes/neon/'+path,import.meta.url),'utf8');
const master=read('master/07_functions.sql'),control=read('control/07_functions.sql');
const fn=(source,name)=>{const start=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'('),end=source.indexOf('$$;',start);if(start<0||end<start)throw Error(name);return source.slice(start,end+3);};
const constraint=read('control/03_tables.sql').match(/CONSTRAINT business_partner_mutation_evidence_kind_chk CHECK\(aggregate_kind IN\([\s\S]*?\)\)/)?.[0];
if(!constraint)throw Error('Missing evidence constraint');
const sql=`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';
LOCK TABLE master.supplier,master.customer,master.company_code_supplier_profile,master.company_code_customer_profile,master.business_partner IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 IF EXISTS(SELECT 1 FROM master.supplier) OR EXISTS(SELECT 1 FROM master.customer)
 OR EXISTS(SELECT 1 FROM master.company_code_supplier_profile) OR EXISTS(SELECT 1 FROM master.company_code_customer_profile)
 THEN RAISE EXCEPTION 'Nonempty role/profile tables require explicit conversion; refusing implicit ID migration'; END IF;
END $$;
ALTER TABLE master.business_partner ADD COLUMN supplier_enabled boolean NOT NULL DEFAULT false, ADD COLUMN customer_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE control.business_partner_mutation_evidence DROP CONSTRAINT business_partner_mutation_evidence_kind_chk, ADD ${constraint};
${fn(control,'control.command_business_partner_capability')}
${fn(control,'control.trg_guard_business_partner_capability')}
REVOKE ALL ON FUNCTION control.command_business_partner_capability(uuid,uuid,text,boolean,bigint,text,text,uuid) FROM PUBLIC,athyperapp,athyperadmin;
CREATE TRIGGER trg_business_partner_18_capability_authority BEFORE INSERT OR UPDATE ON master.business_partner FOR EACH ROW EXECUTE FUNCTION control.trg_guard_business_partner_capability();
${['supplier','customer'].map(role=>`ALTER TABLE master.company_code_${role}_profile ADD COLUMN business_partner_id uuid NOT NULL,
 ALTER COLUMN ${role}_id DROP NOT NULL,
 ADD CONSTRAINT company_code_${role}_profile_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT company_code_${role}_profile_partner_coordinate_uq UNIQUE(tenant_id,business_partner_id,company_code_id);`).join('\n')}
${fn(master,'master.trg_validate_partner_profile_references')}
${fn(master,'master.trg_validate_supplier_remittance_link')}
${fn(master,'master.command_materialize_business_partner_company_case')}
${mode==='--rollback-dev'?'ROLLBACK':'COMMIT'};`;
try{execFileSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']});console.log(mode==='--rollback-dev'?'PASS: profile foundation compiled; all changes rolled back.':'Applied additive BP/profile ownership foundation. No reset, row conversion, capability enablement or runtime command grant. Legacy nullable columns retained temporarily for published metadata.');}
catch(error){process.stderr.write(String(error.stderr??error.message));process.exitCode=1;}
