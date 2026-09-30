/** Rollback-only target ownership/guard probe. Never a migration or reset. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const applied=process.argv[2]==='--verify-applied-dev';
if (!applied && process.argv[2] !== '--rollback-dev') throw new Error('Explicit --rollback-dev or --verify-applied-dev required');
const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const container = 'athyper-dev-db-1';
if (execFileSync('docker',['inspect','--format','{{ index .Config.Labels "com.docker.compose.project" }}',container],{encoding:'utf8'}).trim() !== 'athyper-dev') throw new Error('Not the existing DEV database');
const master = read('server/db/ddl/planes/neon/master/07_functions.sql');
const functionSource = (source, name) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  const end = source.indexOf('$$;',start);
  if(start<0||end<start) throw new Error(`Missing function ${name}`);
  return source.slice(start,end+3);
};
const materializer = functionSource(master,'master.command_materialize_business_partner_company_case');
if (/master\.(supplier|customer)\b/.test(materializer)) throw new Error('Company materializer still depends on role identity');
const sql = `BEGIN;
SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';
${applied?'':`ALTER TABLE master.business_partner ADD COLUMN supplier_enabled boolean NOT NULL DEFAULT false, ADD COLUMN customer_enabled boolean NOT NULL DEFAULT false;
${['supplier','customer'].map(role=>`ALTER TABLE master.company_code_${role}_profile
  ADD COLUMN business_partner_id uuid,
  ALTER COLUMN ${role}_id DROP NOT NULL,
  ADD CONSTRAINT probe_${role}_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id),
  ADD CONSTRAINT probe_${role}_coordinate UNIQUE(tenant_id,business_partner_id,company_code_id);`).join('\n')}
${functionSource(master,'master.trg_validate_partner_profile_references')}
${functionSource(master,'master.trg_validate_supplier_remittance_link')}
${materializer}`}
DO $test$
DECLARE b master.business_partner%ROWTYPE; c uuid; p uuid; cp uuid; other_partner uuid;
BEGIN
  SELECT partner.* INTO STRICT b FROM master.business_partner partner WHERE partner.status='active'
    AND NOT EXISTS(SELECT 1 FROM master.company_code_supplier_profile p WHERE p.tenant_id=partner.tenant_id AND p.business_partner_id=partner.id)
    AND NOT EXISTS(SELECT 1 FROM master.company_code_customer_profile p WHERE p.tenant_id=partner.tenant_id AND p.business_partner_id=partner.id)
    AND EXISTS(SELECT 1 FROM master.company_code company WHERE company.tenant_id=partner.tenant_id AND company.is_active)
    ORDER BY partner.id LIMIT 1;
  SELECT id INTO STRICT c FROM master.company_code WHERE tenant_id=b.tenant_id AND is_active ORDER BY id LIMIT 1;
  PERFORM set_config('app.current_tenant_id',b.tenant_id::text,true);
  PERFORM set_config('app.current_principal_id',b.created_by::text,true);
  INSERT INTO master.company_code_supplier_profile(tenant_id,business_partner_id,company_code_id,created_by)
    VALUES(b.tenant_id,b.id,c,b.created_by) RETURNING id INTO p;
  INSERT INTO master.company_code_customer_profile(tenant_id,business_partner_id,company_code_id,created_by)
    VALUES(b.tenant_id,b.id,c,b.created_by) RETURNING id INTO cp;
  BEGIN
    INSERT INTO master.company_code_supplier_profile(tenant_id,business_partner_id,company_code_id,created_by)
      VALUES(b.tenant_id,b.id,c,b.created_by);
    RAISE EXCEPTION 'TEST: duplicate profile allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO master.company_code_customer_profile(tenant_id,business_partner_id,company_code_id,created_by)
      VALUES(b.tenant_id,shared.uuidv7(),c,b.created_by);
    RAISE EXCEPTION 'TEST: missing partner allowed';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  SELECT id INTO STRICT other_partner FROM master.business_partner WHERE tenant_id<>b.tenant_id ORDER BY id LIMIT 1;
  BEGIN
    INSERT INTO master.company_code_customer_profile(tenant_id,business_partner_id,company_code_id,created_by)
      VALUES(b.tenant_id,other_partner,c,b.created_by);
    RAISE EXCEPTION 'TEST: cross-tenant partner allowed';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE master.company_code_supplier_profile SET business_partner_id=shared.uuidv7() WHERE id=p;
    RAISE EXCEPTION 'TEST: owner changed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE master.company_code_supplier_profile SET status='active',updated_by=b.created_by WHERE id=p;
    RAISE EXCEPTION 'TEST: disabled supplier activated profile';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE master.company_code_customer_profile SET status='active',updated_by=b.created_by WHERE id=cp;
    RAISE EXCEPTION 'TEST: disabled customer activated profile';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE master.company_code_supplier_profile SET preferred_remittance_bank_link_id=shared.uuidv7(),updated_by=b.created_by WHERE id=p;
    RAISE EXCEPTION 'TEST: invalid remittance link accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM master.company_code_supplier_profile WHERE id=p AND business_partner_id=b.id AND status='draft')
     OR NOT EXISTS(SELECT 1 FROM master.company_code_customer_profile WHERE id=cp AND business_partner_id=b.id AND status='draft') THEN
    RAISE EXCEPTION 'TEST: retained partner-owned setup missing';
  END IF;
END $test$;
ROLLBACK;`;
execFileSync('docker',['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],
  {input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:1024*1024});
console.log('PASS: partner-owned profile creation, uniqueness, partner FK, immutable owner, disabled activation denial and invalid remittance denial. Company materializer compiled; workflow execution NOT tested. All staged changes rolled back.');
