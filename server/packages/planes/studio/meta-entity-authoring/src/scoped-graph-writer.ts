import { sql, type Kysely, type RawBuilder } from "kysely";
import {
  normalizedCoreMembers,
  normalizedLayoutMembers,
  nativeAiMembers,
  nativeOperationMember,
  referenceMembers,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  changed,
  planBranch,
  positionConstraints,
  type BranchPlan,
  type GraphTable,
  type GraphWriteTable,
  type StoredRow,
} from "./graph-reconciliation.js";

type DB = Kysely<Record<string, never>>;
export interface GraphCoordinate {
  tenant_id: unknown;
  entity_id: unknown;
  change_set_id: string;
  created_by: string;
}
export async function readReconciliationPlans(
  db: DB,
  id: string,
  branches: readonly (readonly [GraphTable, readonly object[] | undefined])[],
) {
  const plans: BranchPlan[] = [];
  // Parent draft lock must already be held. Stable table/row order is shared by all writers.
  for (const [table, rows] of branches) {
    const stored = await sql<{
      value: StoredRow;
    }>`SELECT to_jsonb(t) AS value FROM ${sql.table(`metadata.${table}`)} t WHERE change_set_id=${id}::uuid ORDER BY id`.execute(
      db,
    );
    plans.push(
      planBranch(
        table,
        rows,
        stored.rows.map((row) => row.value),
      ),
    );
  }
  return plans;
}
function scope(
  table: GraphWriteTable,
  c: GraphCoordinate,
): RawBuilder<unknown> {
  return sql`change_set_id=${c.change_set_id}::uuid AND entity_id=${c.entity_id}::uuid AND tenant_id IS NOT DISTINCT FROM ${c.tenant_id}::uuid`;
}
const arrayColumns = new Map<string, string>();
for (const d of [
  ...Object.values(normalizedCoreMembers),
  ...Object.values(normalizedLayoutMembers),
  ...Object.values(nativeAiMembers),
  nativeOperationMember,
  ...Object.values(referenceMembers),
])
  for (const c of Object.values(d.columns))
    if (c.sqlType.endsWith("[]"))
      arrayColumns.set(`${d.table}.${c.column}`, c.sqlType);
function value(item: unknown, table?: GraphWriteTable, column?: string) {
  const type = arrayColumns.get(`${table}.${column}`);
  if (Array.isArray(item) && type) {
    if (!["text[]", "integer[]", "uuid[]"].includes(type))
      throw new AuthoringPolicyError(
        "AUTHORING_ARRAY_TYPE_UNSUPPORTED",
        "The registered array SQL type has no writer.",
      );
    return sql`ARRAY[${sql.join(item.map((v) => sql`${v}`))}]::${sql.raw(type)}`;
  }
  return item && typeof item === "object" && !Array.isArray(item)
    ? sql`${JSON.stringify(item)}::jsonb`
    : sql`${item}`;
}
async function update(
  db: DB,
  table: GraphWriteTable,
  id: string,
  values: StoredRow,
  c: GraphCoordinate,
) {
  const assignments = Object.entries(values).map(
    ([key, item]) => sql`${sql.ref(key)}=${value(item, table, key)}`,
  );
  const result =
    await sql`UPDATE ${sql.table(`metadata.${table}`)} SET ${sql.join(assignments)},updated_by=${c.created_by}::uuid,updated_at=clock_timestamp()
    WHERE id=${id}::uuid AND ${scope(table, c)} RETURNING id`.execute(db);
  if (result.rows.length !== 1)
    throw new AuthoringPolicyError(
      "AUTHORING_MEMBER_WRITE_DENIED",
      `${table}: scoped update did not affect exactly one member.`,
    );
}
async function assertNoImplicitRemovals(db: DB, plans: readonly BranchPlan[]) {
  const removed = new Map(
    plans.map((plan) => [
      plan.table,
      new Set(plan.remove.map((row) => String(row.id))),
    ]),
  );
  // Inspect actual incoming ID FKs, including families not represented by this API.
  // Do not allow CASCADE to silently erase an unselected or retained member.
  for (const plan of plans.filter((plan) => plan.remove.length)) {
    const refs = await sql<{
      schema_name: string;
      table_name: string;
      column_name: string;
    }>`SELECT ns.nspname AS schema_name,t.relname AS table_name,a.attname AS column_name
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
      JOIN LATERAL unnest(c.conkey,c.confkey) AS pair(source_key,target_key) ON true
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=pair.source_key
      JOIN pg_attribute target ON target.attrelid=c.confrelid AND target.attnum=pair.target_key
      WHERE c.contype='f' AND c.confrelid=${`metadata.${plan.table}`}::regclass
        AND target.attname='id' ORDER BY ns.nspname,t.relname,a.attname`.execute(
      db,
    );
    for (const ref of refs.rows) {
      const selected =
        ref.schema_name === "metadata"
          ? removed.get(ref.table_name as GraphWriteTable)
          : undefined;
      const retained =
        await sql`SELECT 1 FROM ${sql.table(`${ref.schema_name}.${ref.table_name}`)}
        WHERE ${sql.ref(ref.column_name)} IN (${sql.join(plan.remove.map((row) => sql`${row.id}::uuid`))})
        ${selected?.size ? sql`AND id NOT IN (${sql.join([...selected].map((id) => sql`${id}::uuid`))})` : sql``} LIMIT 1`.execute(
          db,
        );
      if (retained.rows.length)
        throw new AuthoringPolicyError(
          "AUTHORING_MEMBER_DEPENDENCY",
          `${plan.table}: a retained dependent prevents removal. Remove dependencies explicitly; remapping requires a separate validated batch.`,
        );
    }
  }
}
function sectionsInDependencyOrder<T extends { id: string; values: StoredRow }>(
  rows: readonly T[],
): T[] {
  const remaining = new Map(rows.map((row) => [row.id, row]));
  const result: T[] = [];
  while (remaining.size) {
    const ready = [...remaining.values()].filter(
      (row) => !remaining.has(String(row.values.parent_section_id)),
    );
    if (!ready.length)
      throw new AuthoringPolicyError(
        "AUTHORING_SECTION_CYCLE",
        "Section parents form a cycle.",
      );
    for (const row of ready) {
      result.push(row);
      remaining.delete(row.id);
    }
  }
  return result;
}
export async function writeReconciliationPlans(
  db: DB,
  plans: readonly BranchPlan[],
  c: GraphCoordinate,
) {
  await assertNoImplicitRemovals(db, plans);
  const deferred = plans
    .filter(
      (plan) =>
        positionConstraints[plan.table] &&
        plan.update.some((row) =>
          [
            "position",
            "parent_section_id",
            "entity_surface_section_id",
            "interaction_target",
            "navigation_group_id",
            "entity_surface_id",
            "overlay_id",
            "binding_kind",
          ].some((key) => Object.hasOwn(row.values, key)),
        ),
    )
    .map((plan) => positionConstraints[plan.table]!);
  if (deferred.length) {
    const optional = deferred.includes("entity_surface_section_position_uq")
      ? ["legacy_section_position_guard"]
      : [];
    const evidence = await sql<{
      conname: string;
      condeferrable: boolean;
    }>`SELECT conname,condeferrable FROM pg_constraint
      WHERE connamespace='metadata'::regnamespace AND conname IN (${sql.join([...deferred, ...optional].map((name) => sql`${name}`))})`.execute(
      db,
    );
    if (
      deferred.some(
        (name) =>
          !evidence.rows.some(
            (row) => row.conname === name && row.condeferrable,
          ),
      )
    )
      throw new AuthoringPolicyError(
        "AUTHORING_ORDER_MIGRATION_REQUIRED",
        "Apply the scoped authoring order-constraint forward migration before updating ordered members.",
      );
    for (const name of optional) {
      const present = evidence.rows.find((row) => row.conname === name);
      if (present && !present.condeferrable)
        throw new AuthoringPolicyError(
          "AUTHORING_ORDER_MIGRATION_REQUIRED",
          "The installed legacy ordering guard must be deferrable.",
        );
      if (present) deferred.push(name);
    }
    await sql`SET CONSTRAINTS ${sql.join(deferred.map((name) => sql.ref(`metadata.${name}`)))} DEFERRED`.execute(
      db,
    );
  }
  for (const plan of [...plans].reverse()) {
    const rows =
      plan.table === "entity_surface_section"
        ? sectionsInDependencyOrder(
            plan.remove.map((row) => ({ id: String(row.id), values: row })),
          ).reverse()
        : plan.remove.map((row) => ({ id: String(row.id), values: row }));
    for (const row of rows) {
      const result =
        await sql`DELETE FROM ${sql.table(`metadata.${plan.table}`)} WHERE id=${row.id}::uuid AND ${scope(plan.table, c)} RETURNING id`.execute(
          db,
        );
      if (result.rows.length !== 1)
        throw new AuthoringPolicyError(
          "AUTHORING_MEMBER_WRITE_DENIED",
          `${plan.table}: scoped removal did not affect exactly one member.`,
        );
    }
  }
  // Immediate partial unique indexes cannot be deferred. Clear prior memberships
  // before enabling any final defaults; all staging stays inside this transaction.
  const restore = new Map<object, StoredRow>();
  for (const plan of plans)
    for (const row of plan.update) {
      if (row.before?.is_default === true) {
        await update(db, plan.table, row.id, { is_default: false }, c);
        restore.set(row, { is_default: row.values.is_default ?? true });
      } else if (
        plan.table === "entity_key" &&
        row.before?.key_kind === "primary"
      ) {
        await update(db, plan.table, row.id, { key_kind: "alternate" }, c);
        restore.set(row, { key_kind: row.values.key_kind ?? "primary" });
      }
    }
  for (const plan of plans.filter(changed)) {
    // Departing defaults were cleared above, including when an insert precedes an update.
    const inserts =
      plan.table === "entity_surface_section"
        ? sectionsInDependencyOrder(plan.insert)
        : plan.insert;
    for (const row of inserts) {
      const entries = Object.entries({
        ...row.values,
        ...c,
        id: row.id,
      });
      await sql`INSERT INTO ${sql.table(`metadata.${plan.table}`)} (${sql.join(entries.map(([key]) => sql.ref(key)))})
        VALUES (${sql.join(entries.map(([key, item]) => value(item, plan.table, key)))})`.execute(
        db,
      );
    }
    for (const row of plan.update)
      await update(
        db,
        plan.table,
        row.id,
        { ...restore.get(row), ...row.values },
        c,
      );
  }
  if (deferred.length)
    await sql`SET CONSTRAINTS ${sql.join(deferred.map((name) => sql.ref(`metadata.${name}`)))} IMMEDIATE`.execute(
      db,
    );
}
