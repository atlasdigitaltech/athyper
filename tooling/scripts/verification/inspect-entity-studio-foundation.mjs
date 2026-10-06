/** Read-only deployed-schema evidence. This is not an activation or authority grant. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { requiredReferenceTables } from "../../../server/packages/contracts/meta-entity-authoring/src/reference-foundation-manifest.ts";
export { requiredReferenceTables };
const referenceContract = JSON.parse(
  readFileSync(
    new URL(
      "../../../server/packages/contracts/meta-entity-authoring/src/reference-members.generated.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const coreLayoutContract = JSON.parse(readFileSync(new URL(
  "../../../server/packages/contracts/meta-entity-authoring/src/normalized-core.generated.json", import.meta.url), "utf8"));
const aiContract = JSON.parse(readFileSync(new URL("../../../server/packages/contracts/meta-entity-authoring/src/native-ai.generated.json", import.meta.url), "utf8"));
export function assessAiColumns(tables) {
  const actual = new Map((Array.isArray(tables) ? tables : []).map(t => [t.name, t]));
  const families = Object.entries(aiContract.members).map(([family, d]) => {
    const table = actual.get(d.table);
    const columns = new Map((table?.columns ?? []).map(c => [c.name, c]));
    const missing = Object.values(d.columns).filter(c => {
      const a = columns.get(c.column);
      return !a || a.type !== c.sqlType || a.nullable !== c.nullable;
    }).map(c => c.column);
    return { family, table: d.table, present: table?.present === true, forcedRls: table?.rls === true && table?.forced === true, missing };
  });
  return { contractHash: aiContract.contractHash, families,
    columnsPresent: families.every(f => f.present && f.missing.length === 0),
    missingColumnCount: families.reduce((n,f) => n+f.missing.length,0),
    cutoverQualified: false };
}

const operationContract=JSON.parse(readFileSync(new URL("../../../server/packages/contracts/meta-entity-authoring/src/native-operation.generated.json",import.meta.url),"utf8"));
export function assessOperationColumns(tables){
 const table=(Array.isArray(tables)?tables:[]).find(t=>t.name==="entity_operation");
 const columns=new Map((table?.columns??[]).map(c=>[c.name,c]));
 const missing=Object.values(operationContract.columns).filter(c=>!columns.has(c.column)).map(c=>c.column);
 const mismatched=Object.values(operationContract.columns).filter(c=>columns.has(c.column)&&columns.get(c.column).type!==c.sqlType).map(c=>c.column);
 return {contractHash:operationContract.contractHash,present:table?.present===true,missing,mismatched,columnsPresent:table?.present===true&&!missing.length&&!mismatched.length,cutoverQualified:false};
}

/** Presence inventory only. Installation cannot attest constraint cutover,
 * canonical writer selection, human governance or publication compatibility. */
export function assessCoreLayoutColumns(tables) {
  const actual = new Map((Array.isArray(tables) ? tables : []).map(t => [t.name, new Set((t.columns ?? []).map(c => c.name))]));
  const families = Object.entries(coreLayoutContract.families).map(([family, d]) => {
    const table = d.table.replace(/^metadata\./, "");
    const missing = Object.values(d.columns).filter(c => !actual.get(table)?.has(c.column)).map(c => c.column);
    return { family, table: d.table, declaredProperties: Object.keys(d.columns).length, missing };
  });
  return { contractHash: coreLayoutContract.contractHash, families,
    columnsPresent: families.every(f => f.missing.length === 0),
    missingColumnCount: families.reduce((count, f) => count + f.missing.length, 0),
    cutoverQualified: false,
    requiredEvidence: ["per-constraint retain/replace/retire conformance", "sealed-history and source-provenance preservation", "explicit conversion with unsupported-path rejection", "native writer/reader/compiler version coordination", "application-role scoped-save and independent authority proof"] };
}

export function assessReferenceColumns(tables) {
  if (!Array.isArray(tables))
    return {
      contractHash: referenceContract.contractHash,
      verified: false,
      missing: ["COLUMN_EVIDENCE_UNAVAILABLE"],
    };
  const columns = new Map(
    tables.map((t) => [
      t.name,
      new Map((t.columns ?? []).map((c) => [c.name, c])),
    ]),
  );
  const missing = [];
  for (const d of Object.values(referenceContract.descriptors))
    for (const c of Object.values(d.columns)) {
      const actual = columns.get(d.table)?.get(c.column);
      const expected =
        c.sqlType === "timestamptz"
          ? "timestamp with time zone"
          : c.sqlType === "timestamptz[]"
            ? "timestamp with time zone[]"
            : c.sqlType;
      if (!actual || actual.type !== expected || actual.nullable !== c.nullable)
        missing.push(`${d.table}.${c.column}`);
    }
  for (const c of Object.values(referenceContract.stableIdentity.columns))
    if (!columns.get(referenceContract.stableIdentity.table)?.has(c))
      missing.push(`${referenceContract.stableIdentity.table}.${c}`);
  return {
    contractHash: referenceContract.contractHash,
    verified: missing.length === 0,
    missing,
  };
}

export function assessFoundationSchema(evidence) {
  if (
    !evidence ||
    !Array.isArray(evidence.tables) ||
    typeof evidence.database !== "string"
  )
    throw Error("FOUNDATION_DATABASE_EVIDENCE_INVALID");
  const tables = new Map(evidence.tables.map((row) => [row.name, row]));
  const missing = requiredReferenceTables.filter(
    (name) => !tables.get(name)?.present,
  );
  const unguarded = requiredReferenceTables.filter(
    (name) =>
      tables.get(name)?.present &&
      (!tables.get(name)?.rls || !tables.get(name)?.forced),
  );
  return {
    schema: "entity.foundation-database-inspection/1",
    inspectedAt: new Date().toISOString(),
    evidence,
    missingTables: missing,
    selectedMemberColumns: assessReferenceColumns(evidence.tables),
    coreLayoutColumns: assessCoreLayoutColumns(evidence.tables),
    aiColumns: assessAiColumns(evidence.tables),
    operationColumns: assessOperationColumns(evidence.tables),
    tablesWithoutForcedRls: unguarded,
    qualification: "not-established",
    outstandingEvidence: [
      "exact selected-column/constraint migration conformance",
      "application-role product write and tenant-isolation transaction fixtures",
      "human author/reviewer and protected-state provenance",
      "shared-host bootstrap and target activation",
      "F6 storage authority and F8/F9 live-security evidence",
    ],
    // Even a complete table inventory cannot prove authority, isolation or live reads.
    productionEnabled: false,
  };
}

export function inspectFoundation({ container, database, runtimeRole }) {
  for (const value of [container, database, runtimeRole])
    if (!/^[a-zA-Z0-9_-]+$/.test(value))
      throw Error("FOUNDATION_INSPECTION_COORDINATE_INVALID");
  const names = [...new Set([...requiredReferenceTables, ...Object.values(aiContract.members).map(d => d.table)])].map((name) => `('${name}')`).join(",");
  const query = `BEGIN READ ONLY;
    SELECT jsonb_build_object(
      'database',current_database(),'inspectionRole',current_user,'runtimeRole','${runtimeRole}',
      'runtimeRoleIsAdmin',pg_has_role('${runtimeRole}','athyperadmin','member'),
      'runtimeRoleIsApp',pg_has_role('${runtimeRole}','athyperapp','member'),
      'publishedSourceInventory',(SELECT jsonb_agg(jsonb_build_object('entityCode',e.entity_code,'releaseId',r.id,'contractHash',r.contract_hash,'schema',r.contract_schema_code,'version',r.contract_schema_version,'hasSignature',r.contract_signature IS NOT NULL,'targets',r.target_planes,'normalized',to_jsonb(cs)->>'reference_contract_version') ORDER BY e.entity_code) FROM (SELECT DISTINCT ON(entity_id,tenant_id) * FROM metadata.entity_release ORDER BY entity_id,tenant_id,release_no DESC) r JOIN metadata.entity e ON e.id=r.entity_id JOIN metadata.entity_change_set cs ON cs.id=r.change_set_id),
      'authoringCorpus',(SELECT jsonb_build_object('mutableDrafts',(SELECT count(*) FROM metadata.entity_change_set WHERE status='draft'),'sealedChangeSets',(SELECT count(*) FROM metadata.entity_change_set WHERE status IN ('approved','published')),'fields',(SELECT count(*) FROM metadata.entity_field),'surfaces',(SELECT count(*) FROM metadata.entity_surface),'sections',(SELECT count(*) FROM metadata.entity_surface_section),'bindings',(SELECT count(*) FROM metadata.entity_surface_field_binding))),
      'snapshotCost',(SELECT jsonb_build_object('revisions',count(*),'totalStoredDatumBytes',coalesce(sum(pg_column_size(contract_json)),0),'maximumStoredDatumBytes',max(pg_column_size(contract_json)),'maximumPostgresJsonTextBytes',max(octet_length(contract_json::text)),'maximumDirectSurfaceBindings',max(jsonb_array_length(coalesce(contract_json->'surfaceFieldBindings','[]'::jsonb)))) FROM snapshot.entity_contract_revision),
      'advanceSecurityDefiner',(SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='metadata' AND p.proname='fn_advance_entity_change_set' AND pg_get_function_identity_arguments(p.oid)='p_change_set_id uuid, p_expected_lock_version bigint, p_actor_id uuid'),
      'tables',(SELECT jsonb_agg(jsonb_build_object('name',expected.name,'present',c.oid IS NOT NULL,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'constraints',(SELECT jsonb_agg(jsonb_build_object('name',con.conname,'definition',pg_get_constraintdef(con.oid),'validated',con.convalidated,'deferrable',con.condeferrable) ORDER BY con.conname) FROM pg_constraint con WHERE con.conrelid=c.oid),'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY expected.name)
        FROM (VALUES ${names}) expected(name) LEFT JOIN pg_namespace n ON n.nspname='metadata' LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=expected.name AND c.relkind='r'),
       'writePathInventory',(SELECT jsonb_agg(jsonb_build_object(
        'role',r.rolname,'superuser',r.rolsuper,'bypassRls',r.rolbypassrls,
        'table',t.name,'insertPrivilege',has_table_privilege(r.oid,t.name,'INSERT'),
        'tableUpdatePrivilege',has_table_privilege(r.oid,t.name,'UPDATE'),
        'updatableColumns',(SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a
          WHERE a.attrelid=to_regclass(t.name) AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.oid,t.name,a.attname,'UPDATE')),
        'deletePrivilege',has_table_privilege(r.oid,t.name,'DELETE'),
        'advanceExecute',has_function_privilege(r.oid,'metadata.fn_advance_entity_change_set(uuid,bigint,uuid)','EXECUTE')) ORDER BY r.rolname,t.name)
        FROM pg_roles r CROSS JOIN (VALUES ('metadata.entity_change_set'),('metadata.entity_field'),('metadata.entity_operation'),('snapshot.entity_draft_save')) t(name)
        WHERE r.rolname IN ('${runtimeRole}','athyper_control_api')),
      'writePolicies',(SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check) ORDER BY schemaname,tablename,policyname)
        FROM pg_policies WHERE (schemaname='metadata' AND tablename IN ('entity_change_set','entity_field','entity_operation'))
          OR (schemaname='snapshot' AND tablename='entity_draft_save')),
      'draftPolicies',(SELECT jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check)) FROM pg_policies WHERE schemaname='metadata' AND tablename='entity_change_set')
    ); ROLLBACK;`;
  const output = execFileSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
      "-c",
      query,
    ],
    { encoding: "utf8" },
  );
  return assessFoundationSchema(JSON.parse(output.trim()));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  const option = (key, fallback) => {
    const index = args.indexOf(key);
    if (index < 0) return fallback;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw Error(`Missing ${key}`);
    return value;
  };
  const report = inspectFoundation({
    container: option("--container", "athyper-dev-db-1"),
    database: option("--database", "athyper_studio"),
    runtimeRole: option("--runtime-role", "athyper_runtime"),
  });
  const json = JSON.stringify(report, null, 2) + "\n";
  const output = option("--output", undefined);
  if (output) writeFileSync(output, json);
  else process.stdout.write(json);
}
