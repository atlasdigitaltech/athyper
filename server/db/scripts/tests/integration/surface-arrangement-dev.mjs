// DEV-only rehearsal: uses the installed table, or creates the candidate table
// when absent. All test writes (and candidate DDL) roll back.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ddl = readFileSync(new URL('../../../ddl/common/master/22_principal_surface_arrangement.sql', import.meta.url), 'utf8');
const verification = `
SET LOCAL ROLE athyperapp;
SELECT set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true),
       set_config('app.current_principal_id','22222222-2222-4222-8222-222222222222',true);
INSERT INTO master.principal_surface_arrangement
 (tenant_id,principal_id,plane_code,surface_key,base_revision,arrangement,created_by)
 VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
 'neon','neon.home',1,'{"schema":"athyper-experience-arrangement/1","surfaceId":"neon.home","baseRevision":1}',
 '22222222-2222-4222-8222-222222222222');
DO $$ BEGIN
 IF (SELECT count(*) FROM master.principal_surface_arrangement) <> 1 THEN RAISE EXCEPTION 'owner read failed'; END IF;
 BEGIN
   UPDATE master.principal_surface_arrangement SET base_revision=2;
   RAISE EXCEPTION 'revision mismatch accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   UPDATE master.principal_surface_arrangement SET plane_code='mesh';
   RAISE EXCEPTION 'foreign plane accepted';
 EXCEPTION WHEN check_violation OR insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE master.principal_surface_arrangement SET arrangement='{}';
   RAISE EXCEPTION 'invalid payload accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT set_config('app.current_tenant_id','33333333-3333-4333-8333-333333333333',true);
DO $$ BEGIN
 IF EXISTS(SELECT FROM master.principal_surface_arrangement) THEN RAISE EXCEPTION 'tenant leak'; END IF;
END $$;
SELECT set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true),
       set_config('app.current_principal_id','44444444-4444-4444-8444-444444444444',true);
DO $$ BEGIN
 IF EXISTS(SELECT FROM master.principal_surface_arrangement) THEN RAISE EXCEPTION 'principal leak'; END IF;
END $$;
SELECT set_config('app.current_principal_id','22222222-2222-4222-8222-222222222222',true);
UPDATE master.principal_surface_arrangement SET updated_at=clock_timestamp(),updated_by=principal_id;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM master.principal_surface_arrangement WHERE updated_at IS NOT NULL) THEN RAISE EXCEPTION 'owner update failed'; END IF;
END $$;
DELETE FROM master.principal_surface_arrangement;
DO $$ BEGIN
 IF EXISTS(SELECT FROM master.principal_surface_arrangement) THEN RAISE EXCEPTION 'owner delete failed'; END IF;
END $$;
ROLLBACK;
`;
const command = ['exec','-i','athyper-dev-db-1','sh','-c',
 'psql -X -At -U "$POSTGRES_USER" -d athyper_neon -v ON_ERROR_STOP=1'];
const existing = spawnSync('docker', command, {
 input: "SELECT to_regclass('master.principal_surface_arrangement') IS NOT NULL;", encoding:'utf8',
});
if (existing.status !== 0 || !['t','f'].includes(existing.stdout.trim())) {
 throw new Error('Unable to inventory the DEV arrangement table');
}
const installed = existing.stdout.trim() === 't';
const result = spawnSync('docker', command,
 { input: `BEGIN;\n${installed ? '' : ddl}\n${verification}`, encoding:'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? 'DEV verification failed');
  process.exit(result.status ?? 1);
}
console.log(`PASS: 8 DEV PostgreSQL arrangement checks (${installed ? 'installed table' : 'candidate DDL'}); all test writes rolled back.`);
