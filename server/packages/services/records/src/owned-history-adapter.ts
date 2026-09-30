import { parseCollectionCapture, canonicalJson } from "./snapshots/collection-capture.js";
import { sql, type Transaction } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { IdempotentRecordCommand } from "./record-execution.js";
import type {
  RecordHistoryAdapter,
  RecordHistoryBinding,
} from "./record-history.js";

/** The resolver must return the child descriptor from the root's pinned release
 * dependency graph. Owning writers must take the root lock before child writes.
 * Collection projections are reviewed recording coverage, not viewer permissions. */
export function createOwnedRecordHistoryAdapter(options: {
  readonly key: string;
  readonly maximumCollectionRecords?: number;
  readonly qualify: (
    descriptor: EntityRuntimeDescriptor,
    binding: RecordHistoryBinding,
  ) => void;
  readonly resolveCollection: (input: {
    command: IdempotentRecordCommand;
    root: EntityRuntimeDescriptor;
    collectionCode: string;
  }) => Promise<{
    descriptor: EntityRuntimeDescriptor;
    fields: readonly string[];
    /** Opt-in only through a qualified resolver pinned to the owning release.
     * Legacy captures remain legacy; scope must include reviewed membership filters. */
    comparison?: {
      readonly scope: string;
      readonly targetField?: string;
      readonly semantics?: Readonly<Record<string, "json" | "decimal">>;
    };
  }>;
}): RecordHistoryAdapter {
  const maximum = options.maximumCollectionRecords ?? 1000;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 10000)
    throw Error("RECORD_HISTORY_COLLECTION_LIMIT_INVALID");
  const identifier = /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/;
  return {
    key: options.key,
    qualify: options.qualify,
    async read(command, root, tx: Transaction<Record<string, never>>, binding) {
      if (!command.recordId) throw Error("RECORD_HISTORY_ROOT_ID_REQUIRED");
      const collections: Record<string, unknown> = {};
      if (binding?.collections?.some(item => !root.aggregate?.collections.some(collection => collection.code === item.definition.key))) throw Error("RECORD_HISTORY_COLLECTION_BINDING_MISMATCH");
      for (const collection of root.aggregate?.collections ?? []) {
        const {
          descriptor: child,
          fields,
          comparison: resolverComparison,
        } = await options.resolveCollection({
          command,
          root,
          collectionCode: collection.code,
        });
        const declared = binding?.collections?.find(item => item.definition.key === collection.code);
        if (declared && declared.maximumRecords > maximum) throw Error("RECORD_HISTORY_COLLECTION_LIMIT_UNSUPPORTED");
        const collectionMaximum = declared?.maximumRecords ?? maximum;
        const comparison = declared ? { scope: declared.definition.scope, targetField: declared.definition.targetField, semantics: Object.fromEntries(declared.definition.fields.map(field => [field.key,field.comparison])) } : resolverComparison;
        const parent = child.fields.find(
          (f) =>
            f.key === collection.parentField ||
            f.storagePath === collection.parentField,
        );
        const columns = fields.map((key) =>
          child.fields.find((f) => f.key === key),
        );
        if (
          child.entityCode !== collection.entityCode ||
          child.planeKey !== root.planeKey ||
          !child.storage.tenantField ||
          !parent ||
          !identifier.test(collection.code) ||
          !fields.some(
            (key) =>
              child.fields.find((f) => f.key === key)?.storagePath ===
              child.storage.idField,
          ) ||
          !fields.length ||
          new Set(fields).size !== fields.length ||
          columns.some((f) => !f || f.computation) ||
          [
            child.storage.schema,
            child.storage.object,
            child.storage.idField,
            child.storage.tenantField,
            parent.storagePath,
            ...columns.map((f) => f!.storagePath),
            ...(child.storage.softDeleteField
              ? [child.storage.softDeleteField]
              : []),
          ].some((value) => !identifier.test(value))
        )
          throw Error("RECORD_HISTORY_COLLECTION_PROJECTION_INVALID");
        if (
          child.fields.some(
            (f) => f.writableOn.length && !fields.includes(f.key),
          )
        )
          throw Error("RECORD_HISTORY_COLLECTION_PROJECTION_INCOMPLETE");
        const rows = await sql<
          Record<string, unknown>
        >`SELECT ${sql.join(columns.map((f) => sql`${sql.ref(f!.storagePath)} AS ${sql.ref(f!.key)}`))}
          FROM ${sql.table(`${child.storage.schema}.${child.storage.object}`)}
          WHERE ${sql.ref(child.storage.tenantField)}=${command.context.tenantId}::uuid AND ${sql.ref(parent.storagePath)}=${command.recordId}::uuid
          ${child.storage.softDeleteField ? sql`AND ${sql.ref(child.storage.softDeleteField)} IS NULL` : sql``}
          ORDER BY ${sql.ref(child.storage.idField)} LIMIT ${collectionMaximum + 1} FOR UPDATE`.execute(
          tx,
        );
        if (rows.rows.length > collectionMaximum)
          throw Error("RECORD_HISTORY_COLLECTION_LIMIT_EXCEEDED");
        if (comparison) {
          if (
            Object.keys(comparison.semantics ?? {}).some(
              (key) => !fields.includes(key),
            )
          )
            throw Error("RECORD_HISTORY_COLLECTION_COMPARISON_INVALID");
          collections[collection.code] = parseCollectionCapture(
            {
              schema: "athyper.collection-capture/1",
              subject: {
                tenantId: command.context.tenantId,
                plane: command.context.planeKey,
                entityCode: root.entityCode,
                recordId: command.recordId,
              },
              definition: {
                key: collection.code,
                sourceEntity: child.entityCode,
                sourceContract: child.contractHash,
                scope: comparison.scope,
                identityField: columns.find(
                  (f) => f!.storagePath === child.storage.idField,
                )!.key,
                ...(comparison.targetField
                  ? { targetField: comparison.targetField }
                  : {}),
                fields: fields.map((key) => ({
                  key,
                  comparison: comparison.semantics?.[key] ?? "json",
                })),
              },
              coverage: "complete",
              consistency: "root_transaction",
              records: rows.rows.map((row) =>
                Object.fromEntries(
                  Object.entries(row).map(([key, value]) => [
                    key,
                    value instanceof Date ? value.toISOString() : value,
                  ]),
                ),
              ),
            },
            collectionMaximum,
          );
          if (declared) {
            const captured = collections[collection.code] as import("./snapshots/collection-capture.js").CollectionCapture;
            const signature = (definition: typeof captured.definition) => canonicalJson({...definition, fields:[...definition.fields].sort((a,b)=>a.key.localeCompare(b.key))});
            if (signature(captured.definition) !== signature(declared.definition)) throw Error("RECORD_HISTORY_COLLECTION_BINDING_MISMATCH");
          }
          continue;
        }
        collections[collection.code] = {
          entityCode: child.entityCode,
          releaseId: child.releaseId,
          contractHash: child.contractHash,
          fields: [...fields].sort(),
          records: rows.rows,
        };
      }
      return collections;
    },
  };
}
