import { execFileSync } from "node:child_process";

// Read-only local configuration inventory. No credentials, proposal data, or delivery actions.
// Optional positional arguments: database container, source API container.
const [database = "athyper-dev-db-1", api = "athyper-dev-source-api-1"] =
  process.argv.slice(2);
const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
const query = (sql) =>
  JSON.parse(
    run("docker", [
      "exec",
      database,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "athyper_neon",
      "-c",
      `BEGIN READ ONLY; SELECT coalesce(jsonb_agg(row_to_json(inventory)), '[]'::jsonb) FROM (${sql}) inventory; COMMIT;`,
    ]),
  );
const preview = JSON.parse(
  run("docker", [
    "exec",
    api,
    "node",
    "--disable-warning=ExperimentalWarning",
    "-e",
    `
const {DatabaseSync}=require('node:sqlite');
const {join}=require('node:path');
const db=new DatabaseSync(join(process.env.ATHYPER_LOCAL_PREVIEW_ROOT,'meta-entity.sqlite'),{readOnly:true});
const rows=db.prepare('SELECT a.hash,a.body FROM heads h JOIN artifacts a ON a.hash=h.artifact_hash ORDER BY h.coordinate').all();
console.log(JSON.stringify(rows.map(row=>{
 const b=JSON.parse(row.body), d=b.projections?.neon?.descriptor;
 if(!['business_partner','business_partner_request'].includes(b.entityCode))return null;
 return {tenantId:b.tenantId,entityCode:b.entityCode,changeSetId:b.changeSetId,revision:b.revision,graphHash:b.graphHash,artifactHash:row.hash,
 operations:d?.operations,intakeSurfaces:d?.intakeSurfaces?.map(s=>({key:s.key,title:s.title,sections:s.sections.map(section=>({key:section.key,fields:section.fields.map(f=>Object.fromEntries(['key','valueKey','label','control','widget','required','defaultValue','lookup','payload','visibleWhen','itemSurfaceKey','minItems','maxItems'].filter(k=>f[k]!==undefined).map(k=>[k,f[k]])))}))}))};
}).filter(Boolean)));
db.close();
`,
  ]),
);
console.log(
  JSON.stringify(
    {
      schema: "athyper.internal-supplier-onboarding-p0/1",
      capturedAt: new Date().toISOString(),
      sourceCommit: run("git", ["rev-parse", "HEAD"]),
      scope: {
        databaseContainer: database,
        database: "athyper_neon",
        sourceApiContainer: api,
        access: "read-only configuration; no browser qualification",
      },
      preview,
      caseContracts: query(
        "SELECT id,tenant_id,entity_code,release_no,status,entity_contract_hash,contract_json FROM runtime_meta.entity_contract WHERE entity_code='master.business_partner' AND status='published' ORDER BY tenant_id,id",
      ),
      caseDescriptors: query(
        "SELECT id,tenant_id,descriptor_kind,status,compiled_hash FROM runtime_meta.entity_descriptor WHERE entity_id IN (SELECT entity_id FROM runtime_meta.entity_contract WHERE entity_code='master.business_partner') ORDER BY tenant_id,id",
      ),
      cycles: query(
        "SELECT c.tenant_id,c.id cycle_type_id,c.code,r.id revision_id,r.revision_number,r.template_hash,r.template_json->'template'->'tasks' tasks FROM control.cycle_type c JOIN control.cycle_template_revision r ON r.tenant_id=c.tenant_id AND r.cycle_type_id=c.id WHERE c.code LIKE '%SUPPLIER%' ORDER BY c.tenant_id,c.code,r.revision_number",
      ),
      policies: query(
        "SELECT id,tenant_id,entity_type,name,version_no,evaluation_mode,status FROM control.policy_definition ORDER BY tenant_id,entity_type,id",
      ),
      templates: query(
        "SELECT t.tenant_id,t.code,t.status,b.entity_code,b.operation_code,b.variant_code,b.locale_code,v.id version_id,v.version,v.checksum FROM master.template t LEFT JOIN master.template_binding b ON b.tenant_id=t.tenant_id AND b.template_id=t.id LEFT JOIN snapshot.template_version v ON v.tenant_id=t.tenant_id AND v.id=t.current_version_id ORDER BY t.tenant_id,t.code,b.id",
      ),
      notifications: query(
        "SELECT tenant_id,template_key,channel,version,status FROM control.notification_template WHERE template_key ~ '(business_partner|supplier)' ORDER BY tenant_id,template_key,channel,version",
      ),
      localServices: run("docker", [
        "ps",
        "--filter",
        "name=athyper-dev-",
        "--format",
        "{{.Names}}\\t{{.Status}}",
      ]).split("\n"),
      toolchain: { node: process.version, pnpm: run("pnpm", ["--version"]) },
    },
    null,
    2,
  ),
);
