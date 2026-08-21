import type { Authorizer } from "@athyper/server-contract-auth";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { ListRecordsQuery, RecordQueryService, RecordRepository, RecordTransactionCoordinator } from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";

export interface RecordQueryServiceOptions<Transaction = unknown> {
  readonly metadata: MetadataReader;
  readonly authorizer: Authorizer;
  readonly repository: RecordRepository<Transaction>;
  readonly transactions: RecordTransactionCoordinator<Transaction>;
}

export function createRecordQueryService<Transaction = unknown>(options: RecordQueryServiceOptions<Transaction>): RecordQueryService {
  return {
    async list(query) {
      const descriptor = await descriptorFor(options.metadata, query.context, query.entityCode);
      await authorize(options.authorizer, query.context, descriptor.operations["read"]?.permissionCode, {
        tenantId: query.context.tenantId,
        entityCode: query.entityCode,
        operationKey: "read",
        resourceCode: query.entityCode,
      });
      const projection = await readableProjection(options.authorizer, query.context, descriptor.fields);
      validateQueryFields(descriptor.fields, query, new Set(projection));
      const limit = query.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RecordServiceError(400, "INVALID_LIMIT", "Record list limit must be between 1 and 100");
      return options.transactions.run(query.context.planeKey, { tenantId: query.context.tenantId, principalId: query.context.principalId }, (transaction) => options.repository.list({ descriptor, tenantId: query.context.tenantId, limit, filters: query.filters ?? [], sort: query.sort ?? [], countMode: query.countMode ?? "none", projection, ...(query.cursor ? { cursor: query.cursor } : {}), ...(query.search ? { search: query.search } : {}) }, transaction));
    },
    async get(query) {
      const descriptor = await descriptorFor(options.metadata, query.context, query.entityCode);
      await authorize(options.authorizer, query.context, descriptor.operations["read"]?.permissionCode, {
        tenantId: query.context.tenantId,
        entityCode: query.entityCode,
        operationKey: "read",
        resourceCode: query.entityCode,
        recordId: query.recordId,
      });
      const projection = await readableProjection(options.authorizer, query.context, descriptor.fields);
      return { data: await options.transactions.run(query.context.planeKey, { tenantId: query.context.tenantId, principalId: query.context.principalId }, (transaction) => options.repository.get(descriptor, query.context.tenantId, query.recordId, projection, transaction)) };
    },
  };
}

function validateQueryFields(fields: readonly { key: string; filterable?: boolean; sortable?: boolean; searchable?: boolean }[], query: ListRecordsQuery, readable: ReadonlySet<string>): void {
  const map = new Map(fields.map((field) => [field.key, field]));
  for (const filter of query.filters ?? []) if (!map.get(filter.field)?.filterable || !readable.has(filter.field)) throw new RecordServiceError(400, "FILTER_FIELD_NOT_ALLOWED", `Field is not filterable: ${filter.field}`);
  for (const sort of query.sort ?? []) if (!map.get(sort.field)?.sortable || !readable.has(sort.field)) throw new RecordServiceError(400, "SORT_FIELD_NOT_ALLOWED", `Field is not sortable: ${sort.field}`);
  if (query.search && !fields.some((field) => field.searchable && readable.has(field.key))) throw new RecordServiceError(400, "SEARCH_UNAVAILABLE", "Entity has no searchable fields");
}

async function readableProjection(authorizer: Authorizer, context: Parameters<Authorizer["authorize"]>[0]["context"], fields: readonly { key: string; readPermissionCode?: string }[]): Promise<readonly string[]> {
  const decisions = await Promise.all(fields.map(async (field) => !field.readPermissionCode || (await authorizer.authorize({ context, permissionCode: field.readPermissionCode, resource: { field: field.key } })).allowed));
  return fields.filter((_field, index) => decisions[index]).map((field) => field.key);
}

export async function descriptorFor(metadata: MetadataReader, context: Parameters<MetadataReader["getEntityDescriptor"]>[0], entityCode: string) {
  const descriptor = await metadata.getEntityDescriptor(context, entityCode);
  if (!descriptor) throw new RecordServiceError(404, "ENTITY_DESCRIPTOR_NOT_FOUND", `No active descriptor for ${entityCode}`);
  return descriptor;
}

export async function authorize(
  authorizer: Authorizer,
  context: Parameters<Authorizer["authorize"]>[0]["context"],
  permissionCode: string | undefined,
  resource: Readonly<Record<string, unknown>>,
): Promise<void> {
  if (!permissionCode) throw new RecordServiceError(409, "ENTITY_OPERATION_UNAVAILABLE", "Entity operation is not published");
  const decision = await authorizer.authorize({ context, permissionCode, resource });
  if (!decision.allowed) throw new RecordServiceError(403, "FORBIDDEN", "Record operation is not permitted");
}
