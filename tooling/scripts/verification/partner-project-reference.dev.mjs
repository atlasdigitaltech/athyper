/** Same-DEV, empty-project cutover. No role UUID conversion and no data reset. */
import {execFileSync} from 'node:child_process';
const mode=process.argv[2],container='athyper-dev-db-1';
if(!['--rollback-dev','--apply-existing-dev','--verify-applied-dev'].includes(mode))throw Error('Explicit mode required');
if(execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',container],{encoding:'utf8'}).trim()!=='athyper-dev')throw Error('Not DEV');
const change=`DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM master.project) THEN RAISE EXCEPTION 'Project contains data; explicit conversion required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('master','control','document') AND p.prosrc LIKE '%customer_id%' AND p.prosrc LIKE '%project%') THEN RAISE EXCEPTION 'Unreviewed project function dependency'; END IF;
END $$;
ALTER TABLE master.project DROP CONSTRAINT project_customer_fk;
ALTER TABLE master.project RENAME COLUMN customer_id TO business_partner_id;
ALTER TABLE master.project ADD CONSTRAINT project_business_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT;
ALTER INDEX master.project_customer_idx RENAME TO project_business_partner_idx;`;
const sql=`BEGIN; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;
LOCK TABLE master.project IN ACCESS EXCLUSIVE MODE;
${mode==='--verify-applied-dev'?'':change}
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='master.project'::regclass AND conname='project_business_partner_fk' AND confrelid='master.business_partner'::regclass AND convalidated AND confdeltype='r') THEN RAISE EXCEPTION 'Project BP FK missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='master.project'::regclass AND attname='customer_id' AND NOT attisdropped) THEN RAISE EXCEPTION 'Legacy project column remains'; END IF;
END $$;
${mode==='--apply-existing-dev'?'COMMIT':'ROLLBACK'};`;
try{execFileSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','athyper_neon','-v','ON_ERROR_STOP=1'],{input:sql,stdio:['pipe','pipe','pipe']});console.log(`PASS project BP reference: ${mode}. No data converted/deleted.`);}
catch(error){process.stderr.write(String(error.stderr??error.message));process.exitCode=1;}
