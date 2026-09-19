// Restore the repository-standard onboarding template for CirrusAtlantic DEV only.
// Default is a rollback rehearsal. Pass --apply to commit missing configuration.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const source='server/db/ddl/planes/neon/control/12_reference_seed.sql';
const all=readFileSync(source,'utf8');
const start=all.indexOf('DO $publish$\nDECLARE\n  tenant record;');
const end=all.indexOf('DO $seed_assertions$',start);
assert(start>0 && end>start);
const tenant='44444444-4444-4444-8444-444444444444';
const seed=all.slice(start,end).replaceAll("t.status='active'",`t.id='${tenant}' AND t.status='active'`);
const guard=`DO $guard$ BEGIN
 IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'NEON required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM master.tenant WHERE id='${tenant}' AND status='active') THEN RAISE EXCEPTION 'Active DEV tenant required'; END IF;
 IF EXISTS(SELECT 1 FROM control.cycle_type WHERE tenant_id='${tenant}' AND code='BP_SUPPLIER_ONBOARDING') THEN RAISE EXCEPTION 'Template already exists; inspect before changing configuration'; END IF;
 END $guard$;`;
const input=`BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'; ${guard}\n${seed}\n${process.argv.includes('--apply')?'COMMIT':'ROLLBACK'};`;
execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input,stdio:['pipe','inherit','inherit']});
