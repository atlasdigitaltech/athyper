import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

const ddl = readFileSync(new URL('../../../server/db/ddl/planes/neon/master/33_partner_organization_identity.sql', import.meta.url), 'utf8');
const run = (args, input = '') => new Promise((resolve, reject) => {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve(output) : reject(new Error(output)));
  child.stdin.on('error', () => {});
  child.stdin.end(input);
});

test('organization legal-name DDL preserves tenant, subtype and aggregate invariants', {
  skip: process.env.RUN_BP_IDENTITY_DISPOSABLE !== '1', timeout: 60000,
}, async () => {
  const name = `athyper-bs360-identity-${randomUUID().slice(0, 8)}`;
  let created = false;
  try {
    await run(['run', '--pull=never', '--detach', '--name', name, '--network=none',
      '--label', 'athyper.environment=disposable_local', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16']);
    created = true;
    let ready = false;
    for (let n = 0; n < 100; n++) {
      // The image's temporary initialization server only listens on a Unix socket.
      try { await run(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break; }
      catch { await setTimeout(100); }
    }
    assert.ok(ready, 'isolated database ready');
    const sql = async input => run(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], input);
    await sql(`
      CREATE SCHEMA master; CREATE SCHEMA shared; CREATE SCHEMA control; CREATE ROLE athyperapp;
      CREATE TABLE shared.country(code character(2) PRIMARY KEY);
      INSERT INTO shared.country VALUES('MY');
      CREATE TABLE control.lookup_domain(code text PRIMARY KEY,status text);
      CREATE TABLE control.lookup_value(id uuid PRIMARY KEY,tenant_id uuid,domain_code text REFERENCES control.lookup_domain(code),code text,status text);
      INSERT INTO control.lookup_domain VALUES('master.legal_form','active'),('master.business_type','active');
      INSERT INTO control.lookup_value VALUES('00000000-0000-0000-0000-000000000500',NULL,'master.legal_form','private_limited','active');
      CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS
        $$ SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid $$;
      CREATE FUNCTION shared.current_tenant_id() RETURNS uuid LANGUAGE sql AS $$ SELECT shared.current_tenant_id_soft() $$;
      CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS
        $$ SELECT nullif(current_setting('app.current_principal_id',true),'')::uuid $$;
      CREATE TABLE master.principal(tenant_id uuid,id uuid,PRIMARY KEY(tenant_id,id));
      CREATE TABLE master.business_partner(id uuid PRIMARY KEY,tenant_id uuid NOT NULL,name text NOT NULL,
        partner_category text NOT NULL DEFAULT 'organization' CHECK(partner_category='organization'),
        created_by uuid NOT NULL,record_version bigint NOT NULL DEFAULT 1,updated_at timestamptz,updated_by uuid,
        UNIQUE(tenant_id,id));
      CREATE FUNCTION master.bump() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.record_version:=OLD.record_version+1; RETURN NEW; END $$;
      CREATE TRIGGER bump BEFORE UPDATE ON master.business_partner FOR EACH ROW EXECUTE FUNCTION master.bump();
      GRANT USAGE ON SCHEMA master,shared,control TO athyperapp;
      GRANT SELECT ON control.lookup_domain,control.lookup_value,shared.country TO athyperapp;
      GRANT SELECT,UPDATE ON master.business_partner TO athyperapp;
      INSERT INTO master.principal VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010');
      ${ddl}
      SELECT set_config('app.current_tenant_id','00000000-0000-0000-0000-000000000001',false);
      SELECT set_config('app.current_principal_id','00000000-0000-0000-0000-000000000010',false);
      INSERT INTO master.business_partner(id,tenant_id,name,created_by) VALUES
        ('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000001','Aster Legal','00000000-0000-0000-0000-000000000010');
      UPDATE master.business_partner SET name='Aster Display';
      DO $$ BEGIN
        IF (SELECT legal_name FROM master.business_partner_organization_identity) <> 'Aster Legal' THEN RAISE EXCEPTION 'display overwrote legal'; END IF;
      END $$;
      SET ROLE athyperapp;
      UPDATE master.business_partner_organization_identity SET legal_name='Aster New Legal',updated_by='00000000-0000-0000-0000-000000000010';
      RESET ROLE;
      DO $$ BEGIN
        IF (SELECT name FROM master.business_partner) <> 'Aster Display' THEN RAISE EXCEPTION 'legal overwrote display'; END IF;
        IF (SELECT record_version FROM master.business_partner) <> 3 THEN RAISE EXCEPTION 'aggregate version not advanced'; END IF;
      END $$;
    `);
    const context = `SELECT set_config('app.current_tenant_id','00000000-0000-0000-0000-000000000001',false);
      SELECT set_config('app.current_principal_id','00000000-0000-0000-0000-000000000010',false);`;
    const patch = value => `SELECT master.update_business_partner_organization_identity('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100','${JSON.stringify(value)}'::jsonb,'00000000-0000-0000-0000-000000000010');`;
    await sql(`${context}${patch({legalForm:'private_limited',registrationCountryCode:'MY',incorporationDate:'2001-01-01',foundedYear:2000,employeeCount:0,employeeCountAsOf:'2001-01-01',employeeCountScope:'organization'})}
      DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM master.business_partner_identity_current WHERE legal_form='private_limited' AND registration_country_code='MY' AND employee_count=0) THEN RAISE EXCEPTION 'profile projection mismatch'; END IF; END $$;`);
    await assert.rejects(sql(context+patch({employeeCountScope:null})), /check constraint/);
    await assert.rejects(sql(context+patch({legalForm:'unknown'})), /Unknown legal form/);
    await assert.rejects(sql(context+patch({legalFormValueId:'00000000-0000-0000-0000-000000000999'})), /Invalid organization lookup/);
    await assert.rejects(sql(context+patch({foundedYear:9999})), /future/);
    await assert.rejects(sql(context+patch({employeeCount:-1})), /check constraint/);
    await assert.rejects(sql(context+patch({registrationCountryCode:'ZZ'})), /foreign key/);
    await assert.rejects(sql(context+patch({registrationCountryCode:'MYextra'})), /Invalid registration country/);
    await assert.rejects(sql(context+patch({legalName:123})), /field type/);
    await assert.rejects(sql(context+patch({unowned:'value'})), /Unsupported organization/);
    await sql(`${context}${patch({incorporationDate:null})}
      DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM master.business_partner_identity_current WHERE incorporation_date IS NULL AND legal_form='private_limited') THEN RAISE EXCEPTION 'patch lost existing values'; END IF; END $$;`);
    await sql(`${context}UPDATE control.lookup_value SET status='inactive';
      CREATE TEMP TABLE version_before AS SELECT record_version FROM master.business_partner;
      SET ROLE athyperapp;
      ${patch({legalForm:'private_limited'})}
      RESET ROLE;
      DO $$ BEGIN IF (SELECT record_version FROM master.business_partner)<>(SELECT record_version FROM version_before) THEN RAISE EXCEPTION 'retry advanced version'; END IF; END $$;`);
    await assert.rejects(sql(`BEGIN; DELETE FROM master.business_partner_organization_identity; COMMIT;`), /subtype is missing/);
    await assert.rejects(sql(`UPDATE master.business_partner_organization_identity SET tenant_id='00000000-0000-0000-0000-000000000002';`), /immutable/);
    await assert.rejects(sql(`UPDATE master.business_partner_organization_identity SET legal_name='';`), /actor mismatch|check constraint/);
    await assert.rejects(sql(`INSERT INTO master.business_partner(id,tenant_id,name,created_by,partner_category) VALUES
      ('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-000000000001','Person','00000000-0000-0000-0000-000000000010','person');`), /check constraint/);
    const denied = await sql(`SET ROLE athyperapp;
      SELECT set_config('app.current_tenant_id','00000000-0000-0000-0000-000000000002',false);
      DO $$ BEGIN IF EXISTS(SELECT 1 FROM master.business_partner_organization_identity) THEN RAISE EXCEPTION 'tenant leak'; END IF; END $$;`);
    assert.ok(denied.includes('DO'));
    await assert.rejects(sql(`SET ROLE athyperapp; DELETE FROM master.business_partner_organization_identity;`), /permission denied/);
  } finally {
    if (created) await run(['rm', '--force', name]);
  }
});
