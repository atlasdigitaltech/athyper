/** Explicit user-supplied DEV pilot contacts. Does not assert verification or consent. */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const sql = `BEGIN;
SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),set_config('app.current_principal_id','cca94907-7519-5871-8e3c-6b11aa545c93',true);
INSERT INTO master.contact_link(tenant_id,owner_type_id,owner_id,channel_type,value,is_primary,is_verified,metadata,created_by)
SELECT p.tenant_id,o.id,p.id,'email',v.email,true,false,'{"fixture":"P7 DEV pilot","source":"user_supplied_address","delivery":"local_capture"}'::jsonb,'cca94907-7519-5871-8e3c-6b11aa545c93'::uuid
FROM (VALUES('catl.admin','catl.admin@athyper.com'),('catl.owner','catl.owner@athyper.com')) v(code,email)
JOIN master.principal p ON p.code=v.code AND p.tenant_id='44444444-4444-4444-8444-444444444444'::uuid JOIN control.owner_type o ON o.code='principal'
WHERE NOT EXISTS(SELECT 1 FROM master.contact_link l WHERE l.tenant_id=p.tenant_id AND l.owner_type_id=o.id AND l.owner_id=p.id AND l.channel_type='email' AND l.status='active');
COMMIT;`;
execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-dev-db-1",
    "psql",
    "-U",
    "postgres",
    "-d",
    "athyper_neon",
    "-v",
    "ON_ERROR_STOP=1",
  ],
  { input: sql, stdio: ["pipe", "pipe", "pipe"] },
);
writeFileSync(
  "governance/policy/reports/supplier-communications-dev-recipients.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      passed: true,
      source: "User-supplied DEV pilot addresses",
      principals: ["catl.admin", "catl.owner"],
      verified: false,
      consent: "Must be recorded through authenticated self-service API",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "DEV recipient fixtures installed without verification or consent overrides",
);
