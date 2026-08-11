import { sql, type Transaction } from "kysely";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { SavedView, SavedViewRepository } from "./index.js";

type Tx = Transaction<Record<string, never>>;
type Row = Record<string, unknown>;

export function createKyselySavedViewRepository(transactions: PlaneTransactionCoordinator<Tx>): SavedViewRepository {
  return {
    async list(query) {
      return transactions.run(query.planeKey, query, async (transaction) => (await sql<Row>`
        SELECT id, tenant_id, owner_principal_id, scope, surface_code, entity_code,
               code, name, description, state_json, metadata, status, xmin::text::bigint version
          FROM master.saved_view
         WHERE tenant_id = ${query.tenantId}::uuid
           AND (${query.includeArchived ?? false} OR status = 'active')
           AND (scope IN ('shared','system') OR owner_principal_id = ${query.principalId}::uuid)
           AND (${query.surfaceCode ?? null}::text IS NULL OR surface_code = ${query.surfaceCode ?? null})
           AND (${query.entityCode ?? null}::text IS NULL OR entity_code = ${query.entityCode ?? null})
         ORDER BY status, name
      `.execute(transaction)).rows.map(map));
    },
    async get(query) {
      return transactions.run(query.planeKey, query, async (transaction) => {
        const row = (await sql<Row>`
          SELECT id, tenant_id, owner_principal_id, scope, surface_code, entity_code,
                 code, name, description, state_json, metadata, status, xmin::text::bigint version
            FROM master.saved_view
           WHERE tenant_id = ${query.tenantId}::uuid AND id = ${query.id}::uuid
             AND (${query.includeArchived ?? false} OR status = 'active')
             AND (scope IN ('shared','system') OR owner_principal_id = ${query.principalId}::uuid)
        `.execute(transaction)).rows[0];
        return row ? map(row) : undefined;
      });
    },
    async create(planeKey, view) { await writeView(transactions, planeKey, view, false); },
    async replace(planeKey, view, expectedVersion) {
      return transactions.run(planeKey, actor(view), async (transaction) => {
        const row = (await sql<{ version: number }>`
          UPDATE master.saved_view
             SET name = ${view.name}, description = ${view.description ?? null},
                 state_json = ${JSON.stringify(view.state)}::jsonb,
                 updated_at = now(), updated_by = ${view.ownerPrincipalId!}::uuid
           WHERE tenant_id = ${view.tenantId}::uuid AND id = ${view.id}::uuid
             AND owner_principal_id = ${view.ownerPrincipalId!}::uuid AND scope = 'personal'
             AND status = 'active' AND xmin::text::bigint = ${expectedVersion}
       RETURNING xmin::text::bigint version
        `.execute(transaction)).rows[0];
        return row ? Number(row.version) : undefined;
      });
    },
    async archive(scope, id) {
      return transactions.run(scope.planeKey, scope, async (transaction) => ((await sql`
        UPDATE master.saved_view SET status = 'archived', status_changed_at = now(),
               status_changed_by = ${scope.principalId}::uuid, updated_at = now(), updated_by = ${scope.principalId}::uuid
         WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${id}::uuid AND status = 'active'
           AND scope <> 'system' AND (owner_principal_id = ${scope.principalId}::uuid OR scope = 'shared')
      `.execute(transaction)).numAffectedRows ?? 0n) > 0n);
    },
    async setScope(scope, id, nextScope) {
      return transactions.run(scope.planeKey, scope, async (transaction) => ((await sql`
        UPDATE master.saved_view SET scope = ${nextScope}::master.saved_view_scope_d,
               owner_principal_id = ${nextScope === "personal" ? scope.principalId : null}::uuid,
               updated_at = now(), updated_by = ${scope.principalId}::uuid
         WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${id}::uuid AND status = 'active'
           AND scope <> 'system' AND (owner_principal_id = ${scope.principalId}::uuid OR scope = 'shared')
      `.execute(transaction)).numAffectedRows ?? 0n) > 0n);
    },
    async clone(scope, _source, clone) { await writeView(transactions, scope.planeKey, clone, true); },
    async getPreference(scope, code, surfaceCode) {
      return transactions.run(scope.planeKey, scope, async (transaction) => (await sql<{ preference_value: unknown }>`
        SELECT preference_value FROM master.principal_ui_preference
         WHERE tenant_id = ${scope.tenantId}::uuid AND principal_id = ${scope.principalId}::uuid
           AND preference_code = ${code} AND surface_code = ${surfaceCode}
      `.execute(transaction)).rows[0]?.preference_value);
    },
    async setPreference(scope, code, surfaceCode, value) {
      await transactions.run(scope.planeKey, scope, async (transaction) => { await sql`
        INSERT INTO master.principal_ui_preference
          (tenant_id, principal_id, preference_code, surface_code, preference_value, created_by)
        VALUES (${scope.tenantId}::uuid, ${scope.principalId}::uuid, ${code}, ${surfaceCode}, ${JSON.stringify(value)}::jsonb, ${scope.principalId}::uuid)
        ON CONFLICT ON CONSTRAINT principal_ui_preference_natural_uq DO UPDATE
          SET preference_value = EXCLUDED.preference_value, updated_at = now(), updated_by = EXCLUDED.principal_id
      `.execute(transaction); });
    },
    async clearPreference(scope, code, surfaceCode) {
      await transactions.run(scope.planeKey, scope, async (transaction) => { await sql`
        DELETE FROM master.principal_ui_preference
         WHERE tenant_id = ${scope.tenantId}::uuid AND principal_id = ${scope.principalId}::uuid
           AND preference_code = ${code} AND surface_code = ${surfaceCode}
      `.execute(transaction); });
    },
  };
}

async function writeView(transactions: PlaneTransactionCoordinator<Tx>, planeKey: "studio" | "neon" | "mesh", view: SavedView, clone: boolean): Promise<void> {
  await transactions.run(planeKey, actor(view), async (transaction) => { await sql`
    INSERT INTO master.saved_view
      (id, tenant_id, owner_principal_id, scope, surface_code, entity_code, code, name,
       description, state_json, metadata, status, created_by)
    VALUES (${view.id}::uuid, ${view.tenantId}::uuid, ${view.ownerPrincipalId ?? null}::uuid,
      ${view.scope}::master.saved_view_scope_d, ${view.surfaceCode}, ${view.entityCode}, ${view.code},
      ${view.name}, ${view.description ?? null}, ${JSON.stringify(view.state)}::jsonb,
      ${JSON.stringify({ ...view.metadata, ...(clone ? { cloned: true } : {}) })}::jsonb,
      'active', ${view.ownerPrincipalId!}::uuid)
  `.execute(transaction); });
}
function actor(view: SavedView) { return { tenantId: view.tenantId, principalId: view.ownerPrincipalId! }; }
function map(row: Row): SavedView {
  return { id: String(row["id"]), tenantId: String(row["tenant_id"]), ...(row["owner_principal_id"] ? { ownerPrincipalId: String(row["owner_principal_id"]) } : {}), scope: row["scope"] as SavedView["scope"], surfaceCode: String(row["surface_code"]), entityCode: String(row["entity_code"]), code: String(row["code"]), name: String(row["name"]), ...(row["description"] ? { description: String(row["description"]) } : {}), state: object(row["state_json"]), metadata: object(row["metadata"]), status: row["status"] as SavedView["status"], version: Number(row["version"]) };
}
function object(value: unknown): Record<string, unknown> { if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>; return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : {}; }
