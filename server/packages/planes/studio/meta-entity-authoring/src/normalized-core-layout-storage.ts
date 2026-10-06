import { sql, type Transaction } from "kysely";
import {
  AuthoringPolicyError,
  normalizedCoreMembers,
  normalizedLayoutMembers,
  parseNormalizedLayoutGraph,
  type NormalizedCoreGraph,
  type NormalizedCoreKind,
  type NormalizedLayoutGraph,
  type NormalizedLayoutKind,
  type NormalizedLayoutContext,
} from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson } from "./deterministic.js";
import {
  planNormalizedBranch,
  type BranchPlan,
  type StoredRow,
} from "./graph-reconciliation.js";
import { normalizedCoreFromStorage } from "./normalized-core-codec.js";
import { normalizedLayoutFromStorage } from "./normalized-layout-codec.js";
type DB = Transaction<Record<string, never>>;
export interface NormalizedSaveCoordinate {
  readonly changeSetId: string;
  readonly entityId: string;
  readonly tenantId: string | null;
}
const members = { ...normalizedCoreMembers, ...normalizedLayoutMembers };
type Kind = NormalizedCoreKind | NormalizedLayoutKind;
const fail = (code: string, message: string): never => {
  throw new AuthoringPolicyError(code, message);
};
/** Exact SQL projections precede pg's numeric/date/timestamp decoders. */
function selected(c: { readonly column: string; readonly sqlType: string }) {
  const column = sql.ref(c.column);
  const value =
    c.sqlType === "numeric"
      ? sql`${column}::text`
      : c.sqlType === "date"
        ? sql`to_char(${column},'YYYY-MM-DD')`
        : c.sqlType === "timestamptz"
          ? sql`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
          : column;
  return sql`${value} AS ${sql.ref(c.column)}`;
}
/** Prepare typed plans for the existing scoped transaction writer. This is not
 * an authoring route or a product-write grant. Callers still require the registered
 * host/governance admission, idempotency/snapshot protocol and canonical writer.
 * The currently installed pending checks make this path explicitly unavailable. */
export async function prepareNormalizedCoreLayoutSave(
  tx: DB,
  coordinate: NormalizedSaveCoordinate,
  proposed: {
    readonly core: NormalizedCoreGraph;
    readonly layout: NormalizedLayoutGraph;
  },
  context: NormalizedLayoutContext,
): Promise<readonly BranchPlan[]> {
  if (!tx.isTransaction)
    fail(
      "NORMALIZED_SAVE_TRANSACTION_REQUIRED",
      "Use the existing authoring transaction.",
    );
  if (
    coordinate.entityId !== context.coreContext.entityId ||
    coordinate.tenantId !== context.coreContext.tenantId ||
    canonicalJson(proposed.core) !== canonicalJson(context.core)
  )
    fail(
      "NORMALIZED_SAVE_CONTEXT_MISMATCH",
      "Resolve the exact independently scoped core/layout context.",
    );
  const parent = (
    await sql<{
      status: string;
    }>`SELECT status FROM metadata.entity_change_set WHERE id=${coordinate.changeSetId}::uuid AND entity_id=${coordinate.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${coordinate.tenantId}::uuid FOR UPDATE`.execute(
      tx,
    )
  ).rows;
  if (parent.length !== 1)
    fail("AUTHORING_MEMBER_WRITE_DENIED", "The scoped draft is unavailable.");
  if (parent[0]!.status !== "draft" && parent[0]!.status !== "rejected")
    fail(
      "AUTHORING_DRAFT_NOT_EDITABLE",
      "Sealed and reviewed sources cannot be reconciled.",
    );
  const pending = (
    await sql<{
      table_name: string;
    }>`SELECT t.relname AS table_name FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='metadata' AND c.conname IN (${sql.join(Object.values(members).map((m) => sql`${m.table + "_native_pending_ck"}`))}) ORDER BY t.relname`.execute(
      tx,
    )
  ).rows;
  if (pending.length)
    fail(
      "ENTITY_NATIVE_CUTOVER_NOT_QUALIFIED",
      "Pending native schema guards remain installed; no revision or member was changed.",
    );
  // Dropping pending checks alone is insufficient: legacy required blobs would
  // force a second authoring source. A coordinated forward cutover must retire
  // their coupling while preserving historical compatibility separately.
  const legacyRequired = (
    await sql`SELECT 1 FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='metadata' AND a.attnotnull AND NOT a.attisdropped AND ((t.relname='entity_field' AND a.attname IN ('field_key','type_config')) OR (t.relname='entity_surface' AND a.attname IN ('title','layout_config')) OR (t.relname='entity_surface_section' AND a.attname='layout_config') OR (t.relname='entity_surface_field_binding' AND a.attname IN ('label','layout_config'))) LIMIT 1`.execute(
      tx,
    )
  ).rows;
  if (legacyRequired.length)
    fail(
      "ENTITY_NATIVE_SCHEMA_CUTOVER_REQUIRED",
      "Legacy required properties still prevent single-source native persistence.",
    );
  parseNormalizedLayoutGraph(proposed.layout, context);
  const plans: BranchPlan[] = [];
  const stored = await readNormalizedStoredRows(tx, coordinate);
  for (const kind of Object.keys(members) as Kind[]) {
    const incoming =
      kind === "section" || kind === "binding"
        ? proposed.layout[kind]
        : proposed.core[kind];
    plans.push(planNormalizedBranch(kind, incoming, stored[kind]));
  }
  return plans;
}
async function readNormalizedStoredRows(
  tx: DB,
  coordinate: NormalizedSaveCoordinate,
): Promise<Record<Kind, StoredRow[]>> {
  if (!tx.isTransaction)
    fail(
      "NORMALIZED_SAVE_TRANSACTION_REQUIRED",
      "Existing authoring transaction required.",
    );
  const rows = {} as Record<Kind, StoredRow[]>;
  for (const kind of Object.keys(members) as Kind[]) {
    const d = members[kind];
    rows[kind] = (
      await sql<StoredRow>`SELECT id,created_by,created_at,updated_by,updated_at,${sql.join(Object.values(d.columns).map(selected))} FROM ${sql.table("metadata." + d.table)} WHERE change_set_id=${coordinate.changeSetId}::uuid AND entity_id=${coordinate.entityId}::uuid AND tenant_id IS NOT DISTINCT FROM ${coordinate.tenantId}::uuid ORDER BY id`.execute(
        tx,
      )
    ).rows;
  }
  return rows;
}
/** Exact typed loading; reconciliation separately retains original audit columns. */
export async function loadNormalizedCoreLayout(
  tx: DB,
  coordinate: NormalizedSaveCoordinate,
): Promise<{
  core: NormalizedCoreGraph;
  layout: NormalizedLayoutGraph;
}> {
  const stored = await readNormalizedStoredRows(tx, coordinate);
  const rows: Record<string, object[]> = {};
  for (const kind of Object.keys(members) as Kind[]) {
    rows[kind] = stored[kind].map((row) =>
      kind === "section" || kind === "binding"
        ? normalizedLayoutFromStorage(kind, row)
        : normalizedCoreFromStorage(kind, row),
    );
  }
  return {
    core: {
      field: rows.field,
      runtime: rows.runtime,
      surface: rows.surface,
    } as unknown as NormalizedCoreGraph,
    layout: {
      section: rows.section,
      binding: rows.binding,
    } as unknown as NormalizedLayoutGraph,
  };
}
