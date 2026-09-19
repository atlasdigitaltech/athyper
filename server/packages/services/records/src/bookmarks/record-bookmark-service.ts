import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  ListRecordsQuery,
  RecordTransactionCoordinator,
} from "@athyper/server-contract-records";
import type { Transaction } from "kysely";
import { sql } from "kysely";
import { RecordServiceError } from "../errors.js";
import type { RecordListExecutor } from "../query-service.js";

type Database = Record<string, never>;
type Tx = Transaction<Database>;
type Row = Record<string, unknown>;

export interface RecordBookmarkInput {
  readonly id: string;
  readonly label?: string;
}
export interface RecordBookmarkItem {
  readonly description?: string;
  readonly id: string;
  readonly entityCode: string;
  readonly recordId: string;
  readonly label?: string;
  readonly createdAt: string;
}
export interface RecordBookmarkCache {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { readonly ttlSeconds?: number },
  ): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}
export interface RecordBookmarkService {
  list(
    context: VerifiedRequestContext,
    entityCode?: string,
    scopeCoordinate?: ListRecordsQuery["scopeCoordinate"],
  ): Promise<readonly RecordBookmarkItem[]>;
  membership(
    context: VerifiedRequestContext,
    entityCode: string,
    recordIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
  add(
    context: VerifiedRequestContext,
    entityCode: string,
    records: readonly RecordBookmarkInput[],
    scopeCoordinate?: ListRecordsQuery["scopeCoordinate"],
  ): Promise<ReadonlySet<string>>;
  remove(
    context: VerifiedRequestContext,
    entityCode: string,
    recordIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
}

export function createRecordBookmarkService(options: {
  readonly transactions: RecordTransactionCoordinator<Tx>;
  readonly listExecutor: RecordListExecutor;
  readonly cache?: RecordBookmarkCache;
  readonly cacheTtlSeconds?: number;
}): RecordBookmarkService {
  const ttl = options.cacheTtlSeconds ?? 45;
  const key = (context: VerifiedRequestContext, entityCode: string) =>
    `record-bookmarks:v1:${context.planeKey}:${context.tenantId}:${context.principalId}:${entityCode}`;
  const readEntity = async (
    context: VerifiedRequestContext,
    entityCode: string,
  ): Promise<ReadonlySet<string>> => {
    const cacheKey = key(context, entityCode);
    if (options.cache) {
      try {
        const cached = await options.cache.get(cacheKey);
        if (cached) return parseCachedIds(cached);
      } catch {
        /* Database remains authoritative during cache outages. */
      }
    }
    const ids = await options.transactions.run(
      context.planeKey,
      actor(context),
      async (transaction) => {
        const result = await sql<{
          record_id: string;
        }>`SELECT record_id FROM master.record_bookmark WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${context.principalId}::uuid AND entity_code=${entityCode}`.execute(
          transaction,
        );
        return new Set(result.rows.map((row) => String(row.record_id)));
      },
    );
    if (options.cache) {
      try {
        await options.cache.set(cacheKey, JSON.stringify([...ids]), {
          ttlSeconds: ttl,
        });
      } catch {
        /* Cache population is best effort. */
      }
    }
    return ids;
  };
  const invalidate = async (
    context: VerifiedRequestContext,
    entityCode: string,
  ) => {
    if (options.cache) {
      try {
        await options.cache.delete(key(context, entityCode));
      } catch {
        /* Mutation already committed; short TTL heals the cache. */
      }
    }
  };
  const service: RecordBookmarkService = {
    async list(
      context: VerifiedRequestContext,
      entityCode?: string,
      scopeCoordinate?: ListRecordsQuery["scopeCoordinate"],
    ) {
      if (entityCode) validateEntityCode(entityCode);
      const items = await options.transactions.run(
        context.planeKey,
        actor(context),
        async (transaction) => {
          const result =
            await sql<Row>`SELECT id, entity_code, record_id, label_snapshot, created_at FROM master.record_bookmark WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${context.principalId}::uuid ${entityCode ? sql`AND entity_code=${entityCode}` : sql``} ORDER BY created_at DESC, id DESC LIMIT 200`.execute(
              transaction,
            );
          return Object.freeze(result.rows.map(bookmarkItem));
        },
      );
      if (!entityCode || !items.length) return items;
      const readable = new Map<
        string,
        { label: string; description?: string }
      >();
      // Revalidate stored favourites through the same scope and row-policy boundary as Manage.
      for (let start = 0; start < items.length; start += 100) {
        const batch = items.slice(start, start + 100);
        const execution = await options.listExecutor.execute({
          context,
          entityCode,
          recordIds: batch.map((item) => item.recordId),
          limit: batch.length,
          countMode: "none",
          ...(scopeCoordinate ? { scopeCoordinate } : {}),
        });
        const fields = execution.responseFields ?? [];
        const title = fields.find(
          (field) => field.list?.semanticRole === "title",
        );
        const identity = fields.find(
          (field) =>
            field.key ===
              execution.descriptor.listPresentation?.identityField ||
            field.list?.semanticRole === "identity",
        );
        const status = fields.find(
          (field) => field.list?.semanticRole === "status",
        );
        const display = (value: unknown) =>
          typeof value === "string" || typeof value === "number"
            ? String(value).slice(0, 240)
            : undefined;
        for (const row of execution.result.data) {
          const id = String(row[execution.descriptor.storage.idField]);
          const name = title ? display(row[title.key]) : undefined;
          const code = identity ? display(row[identity.key]) : undefined;
          const state = status ? display(row[status.key]) : undefined;
          const label = name || code || id;
          const description = [code !== label ? code : undefined, state]
            .filter(Boolean)
            .join(" · ");
          readable.set(id, {
            label,
            ...(description ? { description: description.slice(0, 480) } : {}),
          });
        }
      }
      return Object.freeze(
        items
          .filter((item) => readable.has(item.recordId))
          .map((item) =>
            Object.freeze({ ...item, ...readable.get(item.recordId)! }),
          ),
      );
    },
    async membership(
      context: VerifiedRequestContext,
      entityCode: string,
      recordIds: readonly string[],
    ) {
      validateEntityCode(entityCode);
      const requested = validateIds(recordIds);
      if (!requested.length) return new Set<string>();
      const all = await readEntity(context, entityCode);
      return new Set(requested.filter((id) => all.has(id)));
    },
    async add(
      context: VerifiedRequestContext,
      entityCode: string,
      records: readonly RecordBookmarkInput[],
      scopeCoordinate?: ListRecordsQuery["scopeCoordinate"],
    ) {
      validateEntityCode(entityCode);
      const normalized = normalizeRecords(records);
      if (!normalized.length) return new Set<string>();
      const execution = await options.listExecutor.execute({
        context,
        entityCode,
        recordIds: normalized.map((record) => record.id),
        limit: normalized.length,
        countMode: "none",
        ...(scopeCoordinate ? { scopeCoordinate } : {}),
      });
      const authorized = new Set(
        execution.result.data.map((row) =>
          String(row[execution.descriptor.storage.idField]),
        ),
      );
      const denied = normalized.filter((record) => !authorized.has(record.id));
      if (denied.length)
        throw new RecordServiceError(
          403,
          "BOOKMARK_RECORD_FORBIDDEN",
          "One or more selected records are no longer readable in the active authorization scope",
        );
      await options.transactions.run(
        context.planeKey,
        actor(context),
        async (transaction) => {
          await sql`INSERT INTO master.record_bookmark(tenant_id,principal_id,entity_code,record_id,label_snapshot) VALUES ${sql.join(normalized.map((record) => sql`(${context.tenantId}::uuid,${context.principalId}::uuid,${entityCode},${record.id}::uuid,${record.label ?? null})`))} ON CONFLICT (tenant_id,principal_id,entity_code,record_id) DO NOTHING`.execute(
            transaction,
          );
        },
      );
      await invalidate(context, entityCode);
      return new Set<string>(normalized.map((record) => record.id));
    },
    async remove(
      context: VerifiedRequestContext,
      entityCode: string,
      recordIds: readonly string[],
    ) {
      validateEntityCode(entityCode);
      const normalized = validateIds(recordIds);
      if (!normalized.length) return new Set<string>();
      await options.transactions.run(
        context.planeKey,
        actor(context),
        (transaction) =>
          sql`DELETE FROM master.record_bookmark WHERE tenant_id=${context.tenantId}::uuid AND principal_id=${context.principalId}::uuid AND entity_code=${entityCode} AND record_id IN (${sql.join(normalized.map((id) => sql`${id}::uuid`))})`
            .execute(transaction)
            .then(() => undefined),
      );
      await invalidate(context, entityCode);
      return new Set<string>(normalized);
    },
  };
  return Object.freeze(service);
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function actor(context: VerifiedRequestContext) {
  return { tenantId: context.tenantId, principalId: context.principalId };
}
function validateIds(values: readonly string[]): readonly string[] {
  if (
    values.length > 100 ||
    values.some((id) => typeof id !== "string" || !UUID.test(id))
  )
    throw new RecordServiceError(
      400,
      "INVALID_BOOKMARK_RECORDS",
      "Bookmarks require at most one hundred UUID record identities",
    );
  const ids = [...new Set(values.map((value) => value.toLowerCase()))];
  return Object.freeze(ids);
}
function normalizeRecords(
  records: readonly RecordBookmarkInput[],
): readonly RecordBookmarkInput[] {
  const ids = validateIds(records.map((record) => record.id));
  const byId = new Map(
    records.map((record) => [record.id.toLowerCase(), record]),
  );
  return Object.freeze(
    ids.map((id) => {
      const label = byId.get(id)?.label?.trim();
      if (label && [...label].length > 240)
        throw new RecordServiceError(
          400,
          "INVALID_BOOKMARK_LABEL",
          "Bookmark labels must not exceed 240 characters",
        );
      return Object.freeze({ id, ...(label ? { label } : {}) });
    }),
  );
}
export function validateEntityCode(code: string): void {
  if (typeof code !== "string" || !/^[a-z][a-z0-9_.-]{1,126}$/u.test(code))
    throw new RecordServiceError(
      400,
      "INVALID_ENTITY_CODE",
      "entityCode must be a catalog code of 2 to 127 characters",
    );
}
function parseCachedIds(value: string): ReadonlySet<string> {
  const parsed: unknown = JSON.parse(value);
  // Invalid entries are cache misses: let readEntity fall back to the database.
  if (
    !Array.isArray(parsed) ||
    parsed.some((id) => typeof id !== "string" || !UUID.test(id))
  )
    throw new Error("Invalid bookmark cache value");
  return new Set(parsed.map((id: string) => id.toLowerCase()));
}
function bookmarkItem(row: Row): RecordBookmarkItem {
  return Object.freeze({
    id: String(row["id"]),
    entityCode: String(row["entity_code"]),
    recordId: String(row["record_id"]),
    ...(typeof row["label_snapshot"] === "string"
      ? { label: row["label_snapshot"] }
      : {}),
    createdAt: (row["created_at"] instanceof Date
      ? row["created_at"]
      : new Date(String(row["created_at"]))
    ).toISOString(),
  });
}
