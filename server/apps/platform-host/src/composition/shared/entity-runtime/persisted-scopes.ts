import { sql, type Kysely, type Transaction } from "kysely";
import { stampTransactionActor } from "@athyper/server-adapter-db-core";
import { entityScopeResolvers, type EntityScopeCoordinate } from "@athyper/server-contract-metadata";
import type { EntityScopeAdapter } from "@athyper/server-service-records";
import type { EntityParentScopeBinding } from "./parent-admission.js";

type Tx = Transaction<Record<string, never>>;
type Input = Parameters<EntityScopeAdapter["resolve"]>[0];
type Coordinates = Partial<Record<EntityScopeCoordinate, string>>;

/** Scalar-owned parent binding; relation/snapshot owners require their own
 * registered readers and cannot silently use this provider. */
export function createPersistedParentScopeBinding(
  options: Parameters<typeof createPersistedEntityScopes>[0],
  resolver: Input["resolver"],
): EntityParentScopeBinding {
  const scopes = createPersistedEntityScopes(options);
  return {
    planeKey: options.planeKey, entityCode: options.entityCode,
    async resolve(input) {
      const result = await scopes.resolve({
        context: input.context, entityCode: input.entityCode, recordId: input.recordId,
        operationKey: "read", resolver, target: "existing", phase: "execute",
      });
      if (result.state !== "resolved") return null;
      return [resolver === "tenant.record.v1"
        ? { tenantId: input.context.tenantId } : { ...result.coordinates }];
    },
  };
}

/** Trusted storage binding compiled/validated before registration. No SQL or
 * expressions from request input; this provider handles scalar row ownership,
 * not snapshot/relationship ownership or governed-case evidence. */
export function createPersistedEntityScopes(options: {
  readonly planeKey: Input["context"]["planeKey"];
  readonly entityCode: string;
  readonly storage: {
    readonly schema: string; readonly table: string;
    readonly tenantColumn: string; readonly idColumn: string;
    readonly coordinates: Readonly<Partial<Record<EntityScopeCoordinate, string>>>;
  };
  readonly database: Kysely<Record<string, never>>;
  /** Required owning-catalog validation, including active/effective relations.
   * Runs in the same read-only snapshot as the ownership read. */
  readonly validate: (input: Input, coordinates: Readonly<Coordinates>, tx: Tx) => Promise<boolean>;
  readonly preflight?: EntityScopeAdapter["preflight"];
}): EntityScopeAdapter {
  const storage = { ...options.storage, coordinates: { ...options.storage.coordinates } };
  const mappings = Object.entries(storage.coordinates);
  const names = [storage.schema, storage.table, storage.tenantColumn, storage.idColumn, ...mappings.map(([, column]) => column)];
  const coordinateKeys = new Set(Object.values(entityScopeResolvers).flat());
  if (names.some(name => typeof name !== "string" || !/^[a-z_][a-z0-9_]*$/.test(name)) ||
      mappings.some(([coordinate]) => !coordinateKeys.has(coordinate as EntityScopeCoordinate)))
    throw Error("ENTITY_SCOPE_STORAGE_BINDING_INVALID");
  return {
    preflight: options.preflight ?? (async () => "workflow_blocked"),
    async resolve(input) {
      if (input.context.planeKey !== options.planeKey || input.entityCode !== options.entityCode)
        return { state: "invalid" };
      const required = entityScopeResolvers[input.resolver];
      if (!required || required.some(key => !storage.coordinates[key])) return { state: "invalid" };
      return options.database.transaction().execute(async tx => {
        await sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`.execute(tx);
        await sql`SET LOCAL statement_timeout='1500ms'`.execute(tx);
        await stampTransactionActor(tx, input.context);
        let coordinates: Coordinates = {};
        if (input.target === "existing") {
          if (!input.recordId) return { state: "invalid" as const };
          const fields = [
            sql`${sql.ref(storage.idColumn)} AS "__record_id"`,
            ...mappings.map(([key, column]) => sql`${sql.ref(column)} AS ${sql.ref(key)}`),
          ];
          const rows = (await sql<Record<string, unknown>>`
            SELECT ${sql.join(fields)} FROM ${sql.table(storage.schema + "." + storage.table)}
            WHERE ${sql.ref(storage.tenantColumn)}=${input.context.tenantId}::uuid
              AND ${sql.ref(storage.idColumn)}=${input.recordId}::uuid LIMIT 2
          `.execute(tx)).rows;
          if (rows.length !== 1) return { state: "invalid" as const };
          for (const [key] of mappings) {
            const value = rows[0]![key];
            if (typeof value === "string" && value.trim()) coordinates[key as EntityScopeCoordinate] = value;
          }
        } else coordinates = { ...input.coordinates };
        if (required.some(key => !coordinates[key]) || !(await options.validate(input, coordinates, tx)))
          return { state: "invalid" as const };
        return { state: "resolved" as const,
          coordinates: Object.fromEntries(required.map(key => [key, coordinates[key]!])) };
      });
    },
  };
}
