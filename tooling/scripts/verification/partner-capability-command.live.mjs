/** Explicit, rollback-only probe of the staged command on the existing DEV DB.
 * No reset, seed, grants, publication, role impersonation or committed writes.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

if (process.argv[2] !== '--rollback-dev') {
  throw new Error('Use --rollback-dev to explicitly run the transactional DEV probe');
}
const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const container = 'athyper-dev-db-1';
const project = execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "com.docker.compose.project" }}', container], {encoding:'utf8'}).trim();
if (project !== 'athyper-dev') throw new Error('Refusing a non-DEV compose database');
const functions = read('server/db/ddl/planes/neon/control/07_functions.sql');
const start = functions.indexOf('CREATE OR REPLACE FUNCTION control.command_business_partner_capability(');
const end = functions.indexOf('CREATE OR REPLACE FUNCTION control.command_business_partner_lifecycle(', start);
if (start < 0 || end < start) throw new Error('Capability command source not found');
const tables = read('server/db/ddl/planes/neon/control/03_tables.sql');
const constraint = tables.match(/CONSTRAINT business_partner_mutation_evidence_kind_chk CHECK\(aggregate_kind IN\([\s\S]*?\)\)/)?.[0];
if (!constraint) throw new Error('Evidence constraint source not found');
const sql = `
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='20s';
ALTER TABLE master.business_partner ADD COLUMN IF NOT EXISTS supplier_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE control.business_partner_mutation_evidence DROP CONSTRAINT business_partner_mutation_evidence_kind_chk,
  ADD ${constraint};
${functions.slice(start,end)}
DROP TRIGGER IF EXISTS trg_business_partner_18_capability_authority ON master.business_partner;
CREATE TRIGGER trg_business_partner_18_capability_authority BEFORE INSERT OR UPDATE ON master.business_partner
  FOR EACH ROW EXECUTE FUNCTION control.trg_guard_business_partner_capability();
DO $test$
DECLARE b master.business_partner%ROWTYPE; r record; replay record; customer_result record; disabled record;
  n integer; v bigint; initial_evidence bigint; initial_outbox bigint;
BEGIN
  SELECT * INTO STRICT b FROM master.business_partner WHERE status='active' ORDER BY id LIMIT 1;
  PERFORM set_config('app.current_tenant_id',b.tenant_id::text,true);
  PERFORM set_config('app.current_principal_id',b.created_by::text,true);
  SELECT count(*) INTO initial_evidence FROM control.business_partner_mutation_evidence;
  SELECT count(*) INTO initial_outbox FROM event.outbox;
  BEGIN
    UPDATE master.business_partner SET supplier_enabled=true,updated_by=b.created_by WHERE id=b.id;
    RAISE EXCEPTION 'TEST: direct mutation accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM control.command_business_partner_capability(shared.uuidv7(),b.id,'supplier',true,b.record_version,'test','capability-probe-context',b.created_by);
    RAISE EXCEPTION 'TEST: tenant mismatch accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM control.command_business_partner_capability(b.tenant_id,b.id,'supplier',true,b.record_version,'test','capability-probe-actor',shared.uuidv7());
    RAISE EXCEPTION 'TEST: actor mismatch accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM control.command_business_partner_capability(b.tenant_id,b.id,NULL,true,b.record_version,'test','capability-probe-null',b.created_by);
    RAISE EXCEPTION 'TEST: null capability accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM control.command_business_partner_capability(b.tenant_id,b.id,'supplier',NULL,b.record_version,'test','capability-probe-null-bool',b.created_by);
    RAISE EXCEPTION 'TEST: null enabled accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM control.command_business_partner_capability(b.tenant_id,shared.uuidv7(),'supplier',true,b.record_version,'test','capability-probe-missing',b.created_by);
    RAISE EXCEPTION 'TEST: missing partner accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM control.command_business_partner_lifecycle(b.tenant_id,'business_partner',b.id,'inactive',b.record_version,'test','capability-probe-inactivate',b.created_by);
    PERFORM control.command_business_partner_capability(b.tenant_id,b.id,'supplier',true,b.record_version+1,'test','capability-probe-inactive',b.created_by);
    RAISE EXCEPTION 'TEST: inactive partner activation accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE master.business_partner SET supplier_enabled=true,customer_enabled=true,updated_by=b.created_by WHERE id=b.id;
    RAISE EXCEPTION 'TEST: simultaneous direct mutation accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM control.command_business_partner_capability(b.tenant_id,b.id,'supplier',true,b.record_version+1,'test','capability-probe-version',b.created_by);
    RAISE EXCEPTION 'TEST: stale version accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  SELECT * INTO STRICT r FROM control.command_business_partner_capability(b.tenant_id,b.id,'supplier',true,b.record_version,'test','capability-probe-supplier',b.created_by);
  SELECT * INTO STRICT replay FROM control.command_business_partner_capability(b.tenant_id,b.id,'supplier',true,b.record_version,'test','capability-probe-supplier',b.created_by);
  IF NOT replay.replayed OR replay.evidence_id<>r.evidence_id OR replay.record_version<>r.record_version THEN
    RAISE EXCEPTION 'TEST: replay changed evidence/version'; END IF;
  IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE id=b.id AND supplier_enabled AND NOT customer_enabled AND status=b.status AND record_version=b.record_version+1) THEN
    RAISE EXCEPTION 'TEST: independent supplier activation failed'; END IF;
  BEGIN
    PERFORM control.command_business_partner_capability(b.tenant_id,b.id,'supplier',true,r.record_version,'test','capability-probe-noop',b.created_by);
    RAISE EXCEPTION 'TEST: duplicate transition accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM control.command_business_partner_capability(b.tenant_id,b.id,'customer',true,r.record_version,'test','capability-probe-supplier',b.created_by);
    RAISE EXCEPTION 'TEST: idempotency conflict accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  SELECT * INTO STRICT customer_result FROM control.command_business_partner_capability(b.tenant_id,b.id,'customer',true,r.record_version,'test','capability-probe-customer',b.created_by);
  SELECT * INTO STRICT disabled FROM control.command_business_partner_capability(b.tenant_id,b.id,'supplier',false,customer_result.record_version,'test','capability-probe-disable',b.created_by);
  IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE id=b.id AND NOT supplier_enabled AND customer_enabled AND record_version=b.record_version+3) THEN
    RAISE EXCEPTION 'TEST: independent disable failed'; END IF;
  -- An old evidence ID must not authorize another change, even by the same actor.
  PERFORM set_config('app.business_partner_capability_evidence_id',r.evidence_id::text,true);
  BEGIN
    UPDATE master.business_partner SET supplier_enabled=true,updated_by=b.created_by WHERE id=b.id;
    RAISE EXCEPTION 'TEST: old evidence reused';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT count(*) INTO n FROM control.business_partner_mutation_evidence;
  IF n<>initial_evidence+3 THEN RAISE EXCEPTION 'TEST: wrong evidence count'; END IF;
  SELECT count(*) INTO n FROM event.outbox;
  IF n<>initial_outbox+3 THEN RAISE EXCEPTION 'TEST: wrong outbox count'; END IF;
END $test$;
ROLLBACK;
`;
execFileSync('docker', ['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],
  {input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:1024*1024});
console.log('PASS: capability command/guard, tenant/actor checks, version conflict, independent enable/disable, replay, evidence and outbox; all staged DDL and data rolled back.');
