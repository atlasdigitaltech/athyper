import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  requiredReferenceTables,
  nativeAiMembers,
  nativeRetiredColumns,
} from "@athyper/server-contract-meta-entity-authoring";
import { BRANCH_COLUMNS } from "./graph-storage-columns.js";
import { sha256 } from "./deterministic.js";
import type { NativeConversionApplicationPolicy } from "./native-conversion-application.js";

/** Complete physical scope consumed by the canonical authoring repository.
 * It is a schema inventory, never an Entity/permission dispatch allowlist. */
export const nativeSchemaTables = [
  ...new Set([
    ...requiredReferenceTables.map((name) => `metadata.${name}`),
    ...Object.keys(BRANCH_COLUMNS).map((name) => `metadata.${name}`),
    ...Object.values(nativeAiMembers).map(
      (member) => `metadata.${member.table}`,
    ),
    "metadata.entity_authoring_command_receipt",
    "snapshot.entity_draft_save",
  ]),
].sort();
type Tx = Transaction<Record<string, never>>;
type Constraint = { name: string; definition: string; validated: boolean };
export interface NativeSchemaInspection {
  database: string;
  executionRole: string;
  applicationRole: string;
  role: null | {
    superuser: boolean;
    bypassRls: boolean;
    inheritedAdmin: boolean;
  };
  tables: {
    name: string;
    present: boolean;
    owner: string | null;
    rls: boolean | null;
    forced: boolean | null;
    privileges: unknown;
    columns: {
      name: string;
      type: string;
      nullable: boolean;
      default: string | null;
    }[];
    constraints: Constraint[];
    indexes: { definition: string; valid: boolean; ready: boolean }[];
    triggers: {
      name: string;
      enabled: string;
      definition: string;
      function: string;
    }[];
    policies: unknown[];
  }[];
  domains: unknown[];
  guards: {
    signature: string;
    definition: string | null;
    privileges: unknown;
    owner: string | null;
  }[];
}
export interface InstalledNativeSchemaEvidence {
  readonly database: string;
  readonly applicationRole: string;
  /** Independently reviewed complete physical inventory, not a hash captured
   * and trusted by this function itself. Owner admission remains separate. */
  readonly schemaHash: string;
}
const fail = (code: string): never => {
  throw new AuthoringPolicyError(
    code,
    "The canonical native database schema is not independently qualified.",
  );
};

/** Read-only catalogue inspection in the same transaction as application.
 * No DDL, grants, record reads, host publication or source enrollment. */
export function canonicalNativeSchemaQuery(applicationRole: string) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(applicationRole))
    fail("NATIVE_SCHEMA_ROLE_INVALID");
  const names = nativeSchemaTables;
  const guards = [
    "metadata.fn_assert_native_authoring_contract(uuid,text)",
    "metadata.fn_assert_native_authoring_snapshot(uuid,text,integer)",
    "metadata.fn_assert_native_typed_rows(uuid,integer)",
    "metadata.fn_assert_native_layout_graph(uuid)",
    "metadata.fn_assert_native_core_graph(uuid)",
    "metadata.fn_assert_native_root(uuid,text,integer)",
    "metadata.validate_reference_members(uuid)",
  ];
  return sql<{ evidence: NativeSchemaInspection }>`
    WITH selected AS (SELECT name,to_regclass(name) AS oid FROM unnest(${names}::text[]) AS s(name))
    SELECT jsonb_build_object(
      'database',current_database(),'executionRole',current_user,'applicationRole',${applicationRole}::text,
      'role',(SELECT jsonb_build_object('superuser',r.rolsuper,'bypassRls',r.rolbypassrls,
        'inheritedAdmin',EXISTS(SELECT 1 FROM pg_roles a WHERE a.rolname='athyperadmin' AND pg_has_role(r.oid,a.oid,'MEMBER')))
        FROM pg_roles r WHERE r.rolname=${applicationRole}),
      'tables',(SELECT jsonb_agg(jsonb_build_object(
        'name',s.name,'present',c.oid IS NOT NULL,'owner',pg_get_userbyid(c.relowner),
        'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'privileges',c.relacl,
        'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
          'nullable',NOT a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
          FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
        'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',co.conname,'definition',pg_get_constraintdef(co.oid,true),
          'validated',co.convalidated) ORDER BY co.conname) FROM pg_constraint co WHERE co.conrelid=c.oid),'[]'::jsonb),
        'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,
          'ready',i.indisready) ORDER BY ci.relname) FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid=c.oid),'[]'::jsonb),
        'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
          'definition',pg_get_triggerdef(t.oid,true),'function',pg_get_functiondef(t.tgfoid)) ORDER BY t.tgname)
          FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::jsonb),
        'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
          'roles',(SELECT jsonb_agg(CASE WHEN roleid=0 THEN 'PUBLIC' ELSE pg_get_userbyid(roleid) END ORDER BY roleid)
            FROM unnest(p.polroles) AS rs(roleid)), 'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
          ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb)
        ) ORDER BY s.name) FROM selected s LEFT JOIN pg_class c ON c.oid=s.oid),
      'domains',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',n.nspname||'.'||t.typname,'base',format_type(t.typbasetype,t.typtypmod),
        'nullable',NOT t.typnotnull,'default',t.typdefault,'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',co.conname,
          'definition',pg_get_constraintdef(co.oid,true),'validated',co.convalidated) ORDER BY co.conname)
          FROM pg_constraint co WHERE co.contypid=t.oid),'[]'::jsonb)) ORDER BY n.nspname,t.typname),'[]'::jsonb)
        FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='d'
          AND t.oid IN (SELECT a.atttypid FROM pg_attribute a JOIN selected s ON s.oid=a.attrelid WHERE a.attnum>0 AND NOT a.attisdropped)),
      'guards',(SELECT jsonb_agg(jsonb_build_object('signature',g.signature,'definition',pg_get_functiondef(p.oid),
        'privileges',p.proacl,'owner',pg_get_userbyid(p.proowner)) ORDER BY g.signature)
        FROM unnest(${guards}::text[]) AS g(signature) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(g.signature))
    ) AS evidence`;
}
export async function inspectCanonicalNativeSchema(
  tx: Tx,
  applicationRole: string,
): Promise<NativeSchemaInspection> {
  if (!tx.isTransaction) fail("NORMALIZED_SAVE_TRANSACTION_REQUIRED");
  const result = await canonicalNativeSchemaQuery(applicationRole).execute(tx);
  if (result.rows.length !== 1 || !result.rows[0]?.evidence)
    fail("NATIVE_SCHEMA_EVIDENCE_UNAVAILABLE");
  return result.rows[0]!.evidence;
}

/** A positive inventory/hash is schema evidence only. It cannot establish
 * product-write authorization, human approval, F6/F8/F9 or deployment. */
export function nativeSchemaBlockers(
  evidence: NativeSchemaInspection,
): string[] {
  const findings: string[] = [];
  if (
    !evidence.role ||
    evidence.role.superuser ||
    evidence.role.bypassRls ||
    evidence.role.inheritedAdmin
  )
    findings.push("NATIVE_SCHEMA_APPLICATION_ROLE_UNQUALIFIED");
  const actual = new Map(evidence.tables.map((t) => [t.name, t]));
  for (const name of nativeSchemaTables) {
    const table = actual.get(name);
    if (!table?.present) {
      findings.push(`NATIVE_SCHEMA_TABLE_MISSING:${name}`);
      continue;
    }
    if (!table.rls || !table.forced)
      findings.push(`NATIVE_SCHEMA_RLS_UNQUALIFIED:${name}`);
    for (const constraint of table.constraints) {
      if (constraint.name.endsWith("_native_pending_ck"))
        findings.push(
          `NATIVE_SCHEMA_CUTOVER_PENDING:${name}.${constraint.name}`,
        );
      if (!constraint.validated)
        findings.push(
          `NATIVE_SCHEMA_CONSTRAINT_UNVALIDATED:${name}.${constraint.name}`,
        );
    }
    for (const index of table.indexes)
      if (!index.valid || !index.ready)
        findings.push(`NATIVE_SCHEMA_INDEX_UNQUALIFIED:${name}`);
    for (const trigger of table.triggers)
      if (!["O", "A"].includes(trigger.enabled))
        findings.push(`NATIVE_SCHEMA_TRIGGER_DISABLED:${name}.${trigger.name}`);
  }
  for (const signature of [
    "metadata.fn_assert_native_authoring_contract(uuid,text)",
    "metadata.fn_assert_native_authoring_snapshot(uuid,text,integer)",
    "metadata.fn_assert_native_typed_rows(uuid,integer)",
    "metadata.fn_assert_native_layout_graph(uuid)",
    "metadata.fn_assert_native_core_graph(uuid)",
    "metadata.fn_assert_native_root(uuid,text,integer)",
    "metadata.validate_reference_members(uuid)",
  ]) {
    const matched = evidence.guards.filter((g) => g.signature === signature);
    if (matched.length !== 1 || !matched[0]!.definition)
      findings.push(`NATIVE_SCHEMA_GUARD_MISSING:${signature}`);
  }
  const retiredRequired = Object.fromEntries(
    Object.entries(nativeRetiredColumns).map(([table, columns]) => [
      "metadata." + table,
      columns,
    ]),
  );
  for (const [name, columns] of Object.entries(retiredRequired))
    for (const column of columns)
      if (
        actual.get(name)?.columns.some((c) => c.name === column && !c.nullable)
      )
        findings.push(`NATIVE_SCHEMA_LEGACY_REQUIRED:${name}.${column}`);
  return findings.sort();
}

/** Inspection identity is diagnostic, not physical schema. A privileged
 * read-only probe can prepare a review candidate; it cannot qualify writes. */
export function nativeSchemaFingerprint(
  evidence: NativeSchemaInspection,
): string {
  const { executionRole: _inspectionRole, ...physical } = evidence;
  return sha256(physical);
}
export async function qualifyCanonicalNativeSchema(
  tx: Tx,
  installed: InstalledNativeSchemaEvidence,
): Promise<void> {
  if (
    !installed ||
    !/^[a-f0-9]{64}$/.test(installed.schemaHash) ||
    typeof installed.database !== "string" ||
    !installed.database
  )
    fail("NATIVE_SCHEMA_INSTALLED_EVIDENCE_REQUIRED");
  const expected = structuredClone(installed);
  const actual = await inspectCanonicalNativeSchema(
    tx,
    expected.applicationRole,
  );
  if (actual.executionRole !== expected.applicationRole)
    fail("NATIVE_SCHEMA_EXECUTION_ROLE_MISMATCH");
  if (actual.database !== expected.database)
    fail("NATIVE_SCHEMA_DATABASE_MISMATCH");
  if (nativeSchemaBlockers(actual).length) fail("NATIVE_SCHEMA_NOT_READY");
  if (nativeSchemaFingerprint(actual) !== expected.schemaHash)
    fail("NATIVE_SCHEMA_REVIEWED_INVENTORY_MISMATCH");
  // Hold relation locks until the application transaction ends. Reinspect after
  // acquiring every lock, so an intervening table DDL change cannot use a stale
  // pre-lock fingerprint. Role/resource revocation remains independently owned.
  await sql
    .raw(
      "LOCK TABLE " +
        nativeSchemaTables
          .map((name) =>
            name
              .split(".")
              .map((part) => '"' + part + '"')
              .join("."),
          )
          .join(",") +
        " IN ACCESS SHARE MODE",
    )
    .execute(tx);
  const locked = await inspectCanonicalNativeSchema(
    tx,
    expected.applicationRole,
  );
  if (
    nativeSchemaBlockers(locked).length ||
    nativeSchemaFingerprint(locked) !== expected.schemaHash
  )
    fail("NATIVE_SCHEMA_REVIEWED_INVENTORY_MISMATCH");
}

/** Installed host composition wrapper, not a request policy or grant. Inspect
 * before the existing independent authority/storage qualifier, on initial
 * application and replay alike. The original qualifier is never replaced. */
export function withCanonicalNativeSchemaQualification(
  policy: NativeConversionApplicationPolicy,
  installed: InstalledNativeSchemaEvidence,
): NativeConversionApplicationPolicy {
  const expected = structuredClone(installed);
  return {
    ...policy,
    async qualify(tx, input) {
      await qualifyCanonicalNativeSchema(tx, expected);
      await policy.qualify(tx, structuredClone(input));
    },
  };
}
