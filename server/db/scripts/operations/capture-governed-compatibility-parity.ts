#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import postgres from "postgres";

const args = new Map(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.split("=");
    return [key, rest.join("=") || "true"];
  }),
);
const url = args.get("--database-url") ?? process.env.DATABASE_URL;
const environment = args.get("--environment"),
  phase = args.get("--phase"),
  output = args.get("--output"),
  dryRun = args.has("--dry-run");
if (
  !url ||
  (!output && !dryRun) ||
  !new Set(["clean", "supported_upgrade"]).has(environment ?? "") ||
  !new Set(["pre_retirement", "post_retirement"]).has(phase ?? "")
)
  throw new Error(
    "--database-url, --environment=clean|supported_upgrade, --phase=pre_retirement|post_retirement and either --output or --dry-run are required",
  );
if (args.get("--confirm") !== "CAPTURE-G6-COMPATIBILITY-PARITY")
  throw new Error("capture requires --confirm=CAPTURE-G6-COMPATIBILITY-PARITY");
const root = resolve(import.meta.dirname, "../../../.."),
  target = output ? resolve(root, output) : null;
if (
  target &&
  !target.startsWith(resolve(root, "docs/architecture/reports/g6") + "/")
)
  throw new Error("output must be under docs/architecture/reports/g6");
const sql = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5 });
const normalize = (value: string) => value.replace(/\s+/gu, " ").trim();
try {
  const identity = await sql<
    { database: string; plane: string }[]
  >`SELECT current_database() database,current_setting('app.database_plane',true) plane`;
  if (identity[0]?.database !== "athyper_neon" || identity[0]?.plane !== "neon")
    throw new Error("G6 parity capture requires athyper_neon/neon");
  await sql.begin(async (tx) => {
    await tx.unsafe(
      "SET TRANSACTION READ ONLY, ISOLATION LEVEL REPEATABLE READ",
    );
    const catalog = await tx<
      { category: string; object_key: string; definition: string }[]
    >`
   WITH targets(schema_name,relation_name) AS (VALUES
    ('document','business_partner_request'),('document','workforce_iam_projection'),
    ('master','business_partner'),('master','person_business_partner_legacy_link'),
    ('control','business_partner_qualification'),('control','supplier_preference_designation'),
    ('control','customer_account_designation'),('control','customer_credit_review'),
    ('control','business_partner_decision_scope')),
   relations AS (
    SELECT 'relation' category,format('%I.%I',n.nspname,c.relname) object_key,
      concat_ws('|',c.relkind,c.relrowsecurity,c.relforcerowsecurity,owner_role.rolname,coalesce(obj_description(c.oid,'pg_class'),'')) definition
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles owner_role ON owner_role.oid=c.relowner
    WHERE (n.nspname,c.relname) IN(SELECT * FROM targets) OR (n.nspname='document' AND c.relname LIKE 'business_partner_request%')
   ), columns AS (
    SELECT 'column',format('%I.%I.%I',n.nspname,c.relname,a.attname),concat_ws('|',format_type(a.atttypid,a.atttypmod),a.attnotnull,coalesce(pg_get_expr(d.adbin,d.adrelid),''),a.attidentity,a.attgenerated,coalesce(col_description(c.oid,a.attnum),''))
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attnum>0 AND NOT a.attisdropped AND ((n.nspname,c.relname) IN(SELECT * FROM targets) OR (n.nspname='document' AND c.relname LIKE 'business_partner_request%'))
   ), constraints AS (
    SELECT 'constraint',format('%I.%I.%I',n.nspname,c.relname,con.conname),concat_ws('|',con.contype,con.convalidated,con.condeferrable,con.condeferred,pg_get_constraintdef(con.oid,true))
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname,c.relname) IN(SELECT * FROM targets) OR (n.nspname='document' AND c.relname LIKE 'business_partner_request%')
   ), indexes AS (
    SELECT 'index',format('%I.%I',n.nspname,i.relname),pg_get_indexdef(i.oid)
    FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class i ON i.oid=x.indexrelid
    WHERE (n.nspname,c.relname) IN(SELECT * FROM targets) OR (n.nspname='document' AND c.relname LIKE 'business_partner_request%')
   ), triggers AS (
    SELECT 'trigger',format('%I.%I.%I',n.nspname,c.relname,t.tgname),concat_ws('|',t.tgenabled,pg_get_triggerdef(t.oid,true))
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND ((n.nspname,c.relname) IN(SELECT * FROM targets) OR (n.nspname='document' AND c.relname LIKE 'business_partner_request%'))
   ), policies AS (
    SELECT 'policy',format('%I.%I.%I',n.nspname,c.relname,p.polname),concat_ws('|',p.polcmd,p.polpermissive,array_to_string(ARRAY(SELECT rolname FROM pg_roles WHERE oid=ANY(p.polroles) ORDER BY rolname),','),coalesce(pg_get_expr(p.polqual,p.polrelid),''),coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname,c.relname) IN(SELECT * FROM targets) OR (n.nspname='document' AND c.relname LIKE 'business_partner_request%')
   ), domain_values AS (
    SELECT 'domain',format('%I.%I.%s',n.nspname,t.typname,e.enumsortorder),e.enumlabel
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
    WHERE (n.nspname,t.typname)=('master','business_partner_category_d')
   ), routines AS (
    SELECT 'routine',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),
      concat_ws('|',owner_role.rolname,p.prosecdef,p.provolatile,coalesce(array_to_string(p.proconfig,','),''),pg_get_functiondef(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles owner_role ON owner_role.oid=p.proowner
    WHERE n.nspname IN('document','master','control') AND p.proname~'(business_partner|workforce_iam|decision_scope|alias)')
   SELECT * FROM relations UNION ALL SELECT * FROM columns UNION ALL SELECT * FROM constraints
   UNION ALL SELECT * FROM indexes UNION ALL SELECT * FROM triggers UNION ALL SELECT * FROM policies
   UNION ALL SELECT * FROM domain_values UNION ALL SELECT * FROM routines ORDER BY 1,2`;
    const privileges = await tx<
      { category: string; object_key: string; definition: string }[]
    >`
   WITH target_relations AS (
    SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname,c.relname) IN (VALUES ('document','business_partner_request'),('document','workforce_iam_projection'),('master','business_partner'),('master','person_business_partner_legacy_link'),('control','business_partner_qualification'),('control','supplier_preference_designation'),('control','customer_account_designation'),('control','customer_credit_review'),('control','business_partner_decision_scope'))
       OR (n.nspname='document' AND c.relname LIKE 'business_partner_request%'))
   SELECT 'table_grant' category,format('%I.%I.%I',g.table_schema,g.table_name,g.grantee) object_key,string_agg(g.privilege_type,',' ORDER BY g.privilege_type) definition
   FROM information_schema.role_table_grants g JOIN target_relations t ON (t.nspname,t.relname)=(g.table_schema,g.table_name)
   GROUP BY g.table_schema,g.table_name,g.grantee
   UNION ALL
   SELECT 'column_grant',format('%I.%I.%I.%I',g.table_schema,g.table_name,g.column_name,g.grantee),string_agg(g.privilege_type,',' ORDER BY g.privilege_type)
   FROM information_schema.role_column_grants g JOIN target_relations t ON (t.nspname,t.relname)=(g.table_schema,g.table_name)
   GROUP BY g.table_schema,g.table_name,g.column_name,g.grantee
   UNION ALL
   SELECT 'routine_grant',format('%I.%I(%s).%I',g.routine_schema,g.routine_name,pg_get_function_identity_arguments(p.oid),g.grantee),string_agg(g.privilege_type,',' ORDER BY g.privilege_type)
   FROM information_schema.role_routine_grants g
   JOIN pg_namespace n ON n.nspname=g.routine_schema
   JOIN pg_proc p ON p.pronamespace=n.oid AND g.specific_name=p.proname||'_'||p.oid::text
   WHERE g.routine_schema IN('document','master','control') AND g.routine_name~'(business_partner|workforce_iam|decision_scope|alias)'
   GROUP BY g.routine_schema,g.routine_name,p.oid,g.grantee ORDER BY 1,2`;
    const stable = (
      rows: { category: string; object_key: string; definition: string }[],
    ) =>
      rows.map((row) => ({
        category: row.category,
        objectKey: row.object_key,
        definition: normalize(row.definition),
      }));
    const catalogRows = stable(catalog),
      privilegeRows = stable(privileges),
      hash = (value: unknown) =>
        createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const evidence = {
      schemaVersion: 1,
      kind: "athyper.g6-compatibility-parity-capture",
      capturedAt: new Date().toISOString(),
      environment,
      phase,
      database: identity[0].database,
      plane: identity[0].plane,
      transaction: "read_only_repeatable_read",
      catalogHash: hash(catalogRows),
      privilegeHash: hash(privilegeRows),
      catalog: catalogRows,
      privileges: privilegeRows,
    };
    if (target) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`);
    }
    process.stdout.write(
      `G6_PARITY_CAPTURED environment=${environment} phase=${phase} catalog=${catalogRows.length} privileges=${privilegeRows.length}\n`,
    );
  });
} finally {
  await sql.end();
}
