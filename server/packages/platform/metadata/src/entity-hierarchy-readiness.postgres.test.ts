import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import { ENTITY_HIERARCHY_MAX_DEPTH, hierarchyMovableFinding, hierarchyParentKeyFinding, parseEntityHierarchy } from "./entity-hierarchy-descriptor.js";

// Onboarding readiness of the hierarchy candidates (Entity list Tree
// blueprint, section 2.4 checklist), read from the real Neon DDL catalog: the
// self-referencing key and its owner column, the cycle guard and when it
// fires, the parent index, the scoped readable identity, the database depth
// limit, and a bounded depth walk over whatever rows the database holds. The
// declarations are candidates, not published metadata. Node kind (item 5) and
// publication (item 8) stay reviewer items. With
// ATHYPER_HIERARCHY_READINESS_REPORT set, the evidence is written there.

const adminUrl = process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];
const enabled = process.env["ATHYPER_SERVICE_DB_TESTS"] === "true" && Boolean(adminUrl);
const pool = enabled ? new Pool({ connectionString: adminUrl, max: 1 }) : undefined;
afterAll(async () => {
  await pool?.end();
});

const schema = "master";
const tenantColumn = "tenant_id";
// The candidate tables of the readiness audit, a finite evidence scope.
const candidates = ["commodity_category", "asset_class", "legal_entity", "operating_organization", "org_unit", "gl_account", "cost_center", "profit_center", "project_wbs"] as const;
const SHARED_CYCLE_GUARD = "trg_guard_organization_hierarchy_cycle";

interface Readiness {
  readonly table: string;
  readonly parentColumn: string;
  readonly parentNullable: boolean;
  readonly ownerColumns: readonly string[];
  readonly parentKey: { readonly constraint: string; readonly columns: readonly string[]; readonly deferred: boolean };
  readonly cycleGuard: { readonly trigger: string; readonly kind: "shared" | "table" } | undefined;
  readonly guardFiresOnUpdate: boolean;
  readonly databaseDepthLimit: number | undefined;
  readonly parentIndex: { readonly name: string; readonly columns: readonly string[]; readonly partial: boolean } | undefined;
  readonly orderCandidates: readonly { readonly column: string; readonly type: string }[];
  readonly scopedIdentity: readonly (readonly string[])[];
  readonly rows: number;
  readonly dataDepth: number;
  readonly findings: {
    readonly parentKey: string | undefined;
    readonly movable: string | undefined;
    readonly depth: string | undefined;
  };
  readonly recommendedMaxDepth: number | undefined;
}

async function inspect(table: string): Promise<Readiness> {
  const client = pool!;
  const relation = `${schema}.${table}`;
  const keys = await client.query<{ conname: string; columns: string[]; referenced: string[]; deferred: boolean }>(
    `SELECT foreign_key.conname,
            array(SELECT attname::text FROM unnest(foreign_key.conkey) WITH ORDINALITY AS k(n, p) JOIN pg_attribute ON attrelid = foreign_key.conrelid AND attnum = k.n ORDER BY k.p) AS columns,
            array(SELECT attname::text FROM unnest(foreign_key.confkey) WITH ORDINALITY AS k(n, p) JOIN pg_attribute ON attrelid = foreign_key.confrelid AND attnum = k.n ORDER BY k.p) AS referenced,
            foreign_key.condeferred AS deferred
       FROM pg_constraint AS foreign_key
      WHERE foreign_key.contype = 'f' AND foreign_key.conrelid = $1::regclass AND foreign_key.confrelid = foreign_key.conrelid`,
    [relation],
  );
  expect(keys.rows, `${table}: one self-referencing foreign key`).toHaveLength(1);
  const key = keys.rows[0]!;
  const parentColumn = key.columns[key.referenced.indexOf("id")]!;
  const ownerColumns = key.columns.filter((column, index) => column !== parentColumn && column !== tenantColumn && key.referenced[index] === column);
  const columnRows = await client.query<{ attname: string; type: string; attnotnull: boolean }>(
    "SELECT attname::text, format_type(atttypid, atttypmod) AS type, attnotnull FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped",
    [relation],
  );
  const columns = new Map(columnRows.rows.map((row) => [row.attname, row]));

  const triggers = await client.query<{ tgname: string; proname: string; prosrc: string; args: string[]; tgtype: number; watched: string[] | null }>(
    `SELECT trigger.tgname, routine.proname, routine.prosrc, tgtype,
            string_to_array(rtrim(encode(trigger.tgargs, 'escape'), E'\\\\000'), E'\\\\000') AS args,
            (SELECT array_agg(attname::text) FROM pg_attribute WHERE attrelid = trigger.tgrelid AND attnum = ANY (trigger.tgattr)) AS watched
       FROM pg_trigger AS trigger JOIN pg_proc AS routine ON routine.oid = trigger.tgfoid
      WHERE trigger.tgrelid = $1::regclass AND NOT trigger.tgisinternal`,
    [relation],
  );
  // A guard is the shared cycle trigger on this parent column, or a table
  // validator that walks the parent column recursively and refuses with a
  // check violation; either must fire on an update of the parent.
  type Trigger = (typeof triggers.rows)[number];
  const guards = triggers.rows.flatMap((trigger): { trigger: Trigger; kind: "shared" | "table" }[] => {
    if (trigger.proname === SHARED_CYCLE_GUARD && trigger.args[0] === parentColumn) return [{ trigger, kind: "shared" }];
    if (/WITH RECURSIVE/i.test(trigger.prosrc) && trigger.prosrc.includes(parentColumn) && /cycle/i.test(trigger.prosrc) && /check_violation/.test(trigger.prosrc)) return [{ trigger, kind: "table" }];
    return [];
  });
  const guard = guards[0];
  const guardFiresOnUpdate = Boolean(guard && (guard.trigger.tgtype & 16) !== 0 && (!guard.trigger.watched || guard.trigger.watched.includes(parentColumn)));
  const sharedLimit = guard?.kind === "shared" && guard.trigger.args[1] ? Number(guard.trigger.args[1]) : undefined;
  const checks = await client.query<{ definition: string }>("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype = 'c' AND conrelid = $1::regclass", [relation]);
  const levelLimit = checks.rows.map((row) => /level_no <= (\d+)/.exec(row.definition)?.[1]).find(Boolean);
  const databaseDepthLimit = sharedLimit ?? (levelLimit ? Number(levelLimit) : undefined);

  const indexes = await client.query<{ name: string; unique: boolean; partial: boolean; columns: string[] }>(
    `SELECT index_class.relname::text AS name, index.indisunique AS unique, index.indpred IS NOT NULL AS partial,
            array(SELECT attname::text FROM unnest(index.indkey::int2[]) WITH ORDINALITY AS k(n, p) JOIN pg_attribute ON attrelid = index.indrelid AND attnum = k.n ORDER BY k.p) AS columns
       FROM pg_index AS index JOIN pg_class AS index_class ON index_class.oid = index.indexrelid
      WHERE index.indrelid = $1::regclass`,
    [relation],
  );
  const leading = [tenantColumn, ...ownerColumns, parentColumn];
  const parentIndex = indexes.rows.find((index) => leading.every((column, position) => index.columns[position] === column));
  const orderCandidates = (parentIndex?.columns.slice(leading.length) ?? [])
    .map((column) => ({ column, type: columns.get(column)?.type ?? "unknown" }))
    .filter((candidate) => candidate.type === "smallint" || candidate.type === "integer");
  const scopedIdentity = indexes.rows
    .filter((index) => index.unique && !index.partial && !index.columns.includes("id") && [tenantColumn, ...ownerColumns].every((column, position) => index.columns[position] === column))
    .map((index) => index.columns);

  // Data depth: a walk over the stored parent column (never a stored level),
  // bounded one past the largest limit the checklist can act on.
  const bound = 33;
  const walk = await client.query<{ rows: string; depth: number | null }>(
    `WITH RECURSIVE walk (id, depth) AS (
       SELECT id, 1 FROM ${schema}.${table} WHERE ${parentColumn} IS NULL
       UNION ALL
       SELECT child.id, walk.depth + 1 FROM ${schema}.${table} AS child JOIN walk ON child.${parentColumn} = walk.id WHERE walk.depth < $1
     )
     SELECT (SELECT count(*) FROM ${schema}.${table})::text AS rows, max(depth) AS depth FROM walk`,
    [bound],
  );
  const rows = Number(walk.rows[0]!.rows);
  const dataDepth = walk.rows[0]!.depth ?? 0;

  // The candidate declaration the DDL supports: the owner column as scope.
  const field = (column: string): EntityFieldDescriptor => ({ key: column, storagePath: column, type: column === parentColumn || ownerColumns.includes(column) ? "reference" : "string", required: column !== parentColumn, writableOn: [] });
  const byKey = new Map([...columns.keys()].map((column) => [column, field(column)]));
  const recommendedMaxDepth = dataDepth > ENTITY_HIERARCHY_MAX_DEPTH ? undefined : Math.max(dataDepth, Math.min(databaseDepthLimit ?? ENTITY_HIERARCHY_MAX_DEPTH, ENTITY_HIERARCHY_MAX_DEPTH));
  const declaration = parseEntityHierarchy({ parentField: parentColumn, ...(ownerColumns.length === 1 ? { scopeField: ownerColumns[0] } : {}), maxDepth: recommendedMaxDepth ?? ENTITY_HIERARCHY_MAX_DEPTH, movable: true });
  return {
    table,
    parentColumn,
    parentNullable: !columns.get(parentColumn)!.attnotnull,
    ownerColumns,
    parentKey: { constraint: key.conname, columns: key.columns, deferred: key.deferred },
    cycleGuard: guard ? { trigger: guard.trigger.tgname, kind: guard.kind } : undefined,
    guardFiresOnUpdate,
    databaseDepthLimit,
    parentIndex: parentIndex ? { name: parentIndex.name, columns: parentIndex.columns, partial: parentIndex.partial } : undefined,
    orderCandidates,
    scopedIdentity,
    rows,
    dataDepth,
    findings: {
      parentKey: hierarchyParentKeyFinding({ hierarchy: declaration, byKey, parentKeyColumns: key.columns, tenantColumn }),
      movable: hierarchyMovableFinding({ hierarchy: declaration, cycleGuarded: guardFiresOnUpdate }),
      depth: dataDepth > ENTITY_HIERARCHY_MAX_DEPTH ? "TREE_DEPTH_ABOVE_CAP" : undefined,
    },
    recommendedMaxDepth,
  };
}

describe.skipIf(!enabled)("hierarchy onboarding readiness on the real Neon DDL (section 2.4)", () => {
  it("records the checklist evidence for every candidate table", async () => {
    const evidence: Readiness[] = [];
    for (const table of candidates) evidence.push(await inspect(table));
    const report = process.env["ATHYPER_HIERARCHY_READINESS_REPORT"];
    if (report) writeFileSync(report, `${JSON.stringify({ schema, inspectedAt: new Date().toISOString(), evidence }, null, 2)}\n`);
    const summary = Object.fromEntries(
      evidence.map((entry) => [
        entry.table,
        {
          parent: entry.parentColumn,
          owner: entry.ownerColumns.join(",") || null,
          deferred: entry.parentKey.deferred,
          guard: entry.cycleGuard?.kind ?? null,
          guardOnUpdate: entry.guardFiresOnUpdate,
          limit: entry.databaseDepthLimit ?? null,
          parentIndex: entry.parentIndex?.name ?? null,
          order: entry.orderCandidates.map((candidate) => candidate.column).join(",") || null,
          identity: entry.scopedIdentity.length > 0,
        },
      ]),
    );
    // The DDL facts each pilot's declaration relies on; a DDL change that
    // moves any of them fails here before it reaches onboarding.
    expect(summary).toEqual({
      commodity_category: { parent: "parent_id", owner: null, deferred: false, guard: "table", guardOnUpdate: true, limit: null, parentIndex: "commodity_category_parent_idx", order: null, identity: true },
      asset_class: { parent: "parent_id", owner: null, deferred: false, guard: "shared", guardOnUpdate: true, limit: null, parentIndex: "asset_class_parent_idx", order: null, identity: true },
      legal_entity: { parent: "parent_legal_entity_id", owner: null, deferred: false, guard: "shared", guardOnUpdate: true, limit: null, parentIndex: "legal_entity_parent_idx", order: null, identity: true },
      operating_organization: { parent: "parent_operating_organization_id", owner: null, deferred: false, guard: "shared", guardOnUpdate: true, limit: 12, parentIndex: "operating_organization_parent_idx", order: null, identity: true },
      org_unit: { parent: "parent_org_unit_id", owner: null, deferred: false, guard: "shared", guardOnUpdate: true, limit: null, parentIndex: "org_unit_parent_idx", order: "sort_order", identity: true },
      gl_account: { parent: "parent_id", owner: "chart_of_account_id", deferred: true, guard: "shared", guardOnUpdate: true, limit: 32, parentIndex: "gl_account_parent_idx", order: "sort_order", identity: true },
      cost_center: { parent: "parent_id", owner: "company_code_id", deferred: true, guard: "shared", guardOnUpdate: true, limit: null, parentIndex: "cost_center_parent_idx", order: "sort_order", identity: true },
      profit_center: { parent: "parent_id", owner: "company_code_id", deferred: true, guard: "shared", guardOnUpdate: true, limit: null, parentIndex: "profit_center_parent_idx", order: "sort_order", identity: true },
      project_wbs: { parent: "parent_wbs_id", owner: "project_id", deferred: false, guard: "table", guardOnUpdate: true, limit: null, parentIndex: "project_wbs_parent_idx", order: null, identity: true },
    });
    for (const entry of evidence) {
      expect(entry.parentNullable, `${entry.table}: nullable parent`).toBe(true);
      // The candidate declaration (owner column as scope, movable) passes the
      // two DDL checks that wait for the metadata cleanup to be wired.
      expect(entry.findings, entry.table).toEqual({ parentKey: undefined, movable: undefined, depth: undefined });
    }
  });

  it("fails the declaration checks where the DDL does not support them", async () => {
    const gl = await inspect("gl_account");
    const byKey = new Map([gl.parentColumn, ...gl.ownerColumns].map((column) => [column, { key: column, storagePath: column, type: "reference", required: column !== gl.parentColumn, writableOn: [] } as EntityFieldDescriptor]));
    // An owner-scoped key without the scope declared, and a flat key with one.
    expect(hierarchyParentKeyFinding({ hierarchy: parseEntityHierarchy({ parentField: gl.parentColumn, maxDepth: 16 }), byKey, parentKeyColumns: gl.parentKey.columns, tenantColumn })).toBe("TREE_SCOPE_FIELD_REQUIRED");
    const commodity = await inspect("commodity_category");
    expect(hierarchyParentKeyFinding({ hierarchy: parseEntityHierarchy({ parentField: "parent_id", scopeField: "chart_of_account_id", maxDepth: 16 }), byKey: new Map([...byKey, ["parent_id", byKey.get("parent_id")!]]), parentKeyColumns: commodity.parentKey.columns, tenantColumn })).toBe("TREE_SCOPE_FIELD_INELIGIBLE");
  });
});
