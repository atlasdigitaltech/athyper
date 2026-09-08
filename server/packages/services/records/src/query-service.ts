import { createHash } from "node:crypto";
import type { AuthorizationDecision, Authorizer } from "@athyper/server-contract-auth";
import type { EntityFieldDescriptor, EntityRuntimeDescriptor, MetadataReader } from "@athyper/server-contract-metadata";
import type { ListRecordsQuery, RecordCollectionScopeResolution, RecordCollectionScopeResolver, RecordListResult, RecordQueryService, RecordRepository, RecordTransactionCoordinator } from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";
import { recordFieldFilterOperators } from "./list-query-policy.js";
import { authorizeRecordListRead, readableRecordFields } from "./record-read-access.js";

export interface RecordQueryServiceOptions<Transaction = unknown> {
  readonly metadata: MetadataReader;
  readonly authorizer: Authorizer;
  readonly repository: RecordRepository<Transaction>;
  readonly transactions: RecordTransactionCoordinator<Transaction>;
  readonly collectionScopes?: RecordCollectionScopeResolver;
}

export interface ExecutedRecordList {
  readonly descriptor: EntityRuntimeDescriptor;
  readonly collectionScope: Extract<RecordCollectionScopeResolution, { readonly status: "ready" }>;
  readonly authorization: Extract<AuthorizationDecision, { readonly allowed: true }>;
  readonly readableFields: readonly EntityFieldDescriptor[];
  readonly responseFields: readonly EntityFieldDescriptor[];
  readonly result: RecordListResult;
}

export interface RecordListExecutor {
  execute(query: ListRecordsQuery): Promise<ExecutedRecordList>;
}

export function createRecordListExecutor<Transaction = unknown>(options: RecordQueryServiceOptions<Transaction>): RecordListExecutor {
  return Object.freeze({
    async execute(query: ListRecordsQuery) {
      const descriptor = await descriptorFor(options.metadata, query.context, query.entityCode);
      const collectionScope = await resolveCollectionScope(options.collectionScopes, query, descriptor);
      if (collectionScope.status === "context_required") throw new RecordServiceError(409, "RECORD_LIST_SCOPE_REQUIRED", "Select a validated work context before listing scoped records");
      if (collectionScope.status === "forbidden") throw new RecordServiceError(403, collectionScope.code, collectionScope.message);
      const authorization = await authorizeRecordListRead(options.authorizer, query.context, descriptor, collectionScope.authorizationResource);
      if (authorization.scope && !authorization.scope.tenantWide && !collectionScope.constraints.length && descriptor.directoryScope?.mode !== "tenant") throw new RecordServiceError(409, "RECORD_LIST_SCOPE_REQUIRED", "The selected work context has no registered collection-scope resolver");
      const readableFields = await readableRecordFields(options.authorizer, query.context, descriptor);
      const readableKeys = new Set(readableFields.map((field) => field.key));
      validateQueryFields(descriptor.fields, query, readableKeys);
      const responseFields = responseProjection(descriptor, readableFields, query);
      const projection = [...new Set([...responseFields.map((field) => field.key), ...(query.sort ?? []).map((sort) => sort.field)])];
      const limit = query.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RecordServiceError(400, "INVALID_LIMIT", "Record list limit must be between 1 and 100");
      const maxSortLevels = descriptor.listPresentation?.limits?.maxSortLevels ?? 3;
      if ((query.sort?.length ?? 0) > maxSortLevels) throw new RecordServiceError(400, "TOO_MANY_SORT_FIELDS", `Record lists support at most ${maxSortLevels} sort fields`);
      if ((query.filters?.length ?? 0) > 20) throw new RecordServiceError(400, "TOO_MANY_FILTERS", "Record lists support at most twenty filters");
      if ((query.recordIds?.length ?? 0) > 100 || query.recordIds?.some((id) => !UUID.test(id))) throw new RecordServiceError(400, "INVALID_RECORD_IDS", "Record identity restrictions must contain at most one hundred UUIDs");
      if (query.search && query.search.length > 512) throw new RecordServiceError(400, "SEARCH_TOO_LONG", "Record search must not exceed 512 characters");
      const minimumQueryLength = descriptor.listPresentation?.search?.minimumQueryLength ?? 1;
      if (query.search && query.search.trim().length < minimumQueryLength) throw new RecordServiceError(400, "SEARCH_TOO_SHORT", `Record search must contain at least ${minimumQueryLength} characters`);
      if (query.hydrateReferences) throw new RecordServiceError(409, "REFERENCE_HYDRATION_UNAVAILABLE", "Reference hydration is not available for this list endpoint");
      const repositoryResult = await options.transactions.run(query.context.planeKey, { tenantId: query.context.tenantId, principalId: query.context.principalId }, (transaction) => options.repository.list({ descriptor, tenantId: query.context.tenantId, limit, filters: query.filters ?? [], sort: query.sort ?? [], countMode: query.countMode ?? "none", projection, cursorScope: cursorScope(query.context, collectionScope), collectionScope: collectionScope.constraints, ...(query.viewRelationships?{viewRelationships:query.viewRelationships}:{}), ...(query.recordIds !== undefined ? { recordIds: Object.freeze([...new Set(query.recordIds)]) } : {}), ...(query.group ? { group: query.group } : {}), ...(query.cursor ? { cursor: query.cursor } : {}), ...(query.search ? { search: query.search } : {}) }, transaction));
      const result = restrictResponseProjection(repositoryResult, descriptor, responseFields);
      return Object.freeze({ descriptor, collectionScope, authorization, readableFields, responseFields, result });
    },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function restrictResponseProjection(result: RecordListResult, descriptor: EntityRuntimeDescriptor, responseFields: readonly EntityFieldDescriptor[]): RecordListResult {
  const visible = new Set<string>(responseFields.map((field) => field.key));
  // Repository-only storage coordinates are retained for the record envelope and
  // optimistic concurrency, but query-internal sort columns never escape.
  for (const key of [descriptor.storage.idField, descriptor.storage.versionField, descriptor.storage.statusField]) if (key) visible.add(key);
  return Object.freeze({
    ...result,
    data: Object.freeze(result.data.map((row) => Object.freeze(Object.fromEntries(Object.entries(row).filter(([key]) => visible.has(key)))))),
  });
}

export function createRecordQueryService<Transaction = unknown>(options: RecordQueryServiceOptions<Transaction>, listExecutor: RecordListExecutor = createRecordListExecutor(options)): RecordQueryService {
  return {
    async list(query) { return (await listExecutor.execute(query)).result; },
    async get(query) {
      const descriptor = await descriptorFor(options.metadata, query.context, query.entityCode);
      if (descriptor.directoryScope) {
        await authorizeRecordListRead(options.authorizer, query.context, descriptor, { recordId: query.recordId });
        const result = await listExecutor.execute({ context: query.context, entityCode: query.entityCode, recordIds: [query.recordId], limit: 1 });
        return { data: result.result.data[0] ?? null };
      }
      await authorize(options.authorizer, query.context, descriptor.operations["read"]?.permissionCode, {
        tenantId: query.context.tenantId,
        entityCode: query.entityCode,
        operationKey: "read",
        resourceCode: query.entityCode,
        recordId: query.recordId,
      });
      const projection = (await readableRecordFields(options.authorizer, query.context, descriptor)).map((field) => field.key);
      return { data: await options.transactions.run(query.context.planeKey, { tenantId: query.context.tenantId, principalId: query.context.principalId }, (transaction) => options.repository.get(descriptor, query.context.tenantId, query.recordId, projection, transaction)) };
    },
  };
}

function cursorScope(context: ListRecordsQuery["context"], scope: Extract<RecordCollectionScopeResolution, { readonly status: "ready" }>): string {
  return createHash("sha256").update(JSON.stringify({ planeKey: context.planeKey, tenantId: context.tenantId, principalFingerprint: context.permissions.principalFingerprint, authEpoch: context.authEpoch, profileHash: context.profileHash, schemaHash: context.permissions.schemaHash, collectionScope: scope.fingerprintMaterial })).digest("hex");
}

async function resolveCollectionScope(resolver: RecordCollectionScopeResolver | undefined, query: ListRecordsQuery, descriptor: Awaited<ReturnType<typeof descriptorFor>>): Promise<RecordCollectionScopeResolution> {
  if (resolver) return resolver.resolve({ context: query.context, descriptor, operationCode: "read", ...(query.scopeCoordinate ? { coordinate: query.scopeCoordinate } : {}) });
  if(descriptor.directoryScope && descriptor.directoryScope.mode!=="tenant") throw new RecordServiceError(409,"DIRECTORY_SCOPE_RESOLVER_REQUIRED","Directory scope resolver is required");
  return Object.freeze({ status: "ready", authorizationResource: Object.freeze({}), constraints: Object.freeze([]), labels: Object.freeze([]), fingerprintMaterial: Object.freeze({ mode: "tenant" }) });
}

function validateQueryFields(fields: readonly EntityFieldDescriptor[], query: ListRecordsQuery, readable: ReadonlySet<string>): void {
  const map = new Map(fields.map((field) => [field.key, field]));
  for (const filter of query.filters ?? []) {
    const field = map.get(filter.field);
    if (!field?.filterable || !readable.has(filter.field)) throw new RecordServiceError(400, "FILTER_FIELD_NOT_ALLOWED", `Field is not filterable: ${filter.field}`);
    if (!recordFieldFilterOperators(field).includes(filter.operator)) throw new RecordServiceError(400, "FILTER_OPERATOR_NOT_ALLOWED", `Operator is not available for field: ${filter.field}`);
  }
  for (const sort of query.sort ?? []) if (!map.get(sort.field)?.sortable || !readable.has(sort.field)) throw new RecordServiceError(400, "SORT_FIELD_NOT_ALLOWED", `Field is not sortable: ${sort.field}`);
  if (query.group) {
    const field = fields.find((candidate) => candidate.key === query.group);
    if (!field?.list?.groupable || !readable.has(query.group)) throw new RecordServiceError(400, "GROUP_FIELD_NOT_ALLOWED", `Field is not groupable: ${query.group}`);
  }
  if ((query.fields?.length ?? 0) > 100) throw new RecordServiceError(400, "TOO_MANY_PROJECTION_FIELDS", "Record lists support at most one hundred response fields");
  for (const field of query.fields ?? []) if (!map.has(field) || !readable.has(field)) throw new RecordServiceError(400, "PROJECTION_FIELD_NOT_ALLOWED", `Field is not readable: ${field}`);
  if (query.search && !fields.some((field) => field.searchable && readable.has(field.key))) throw new RecordServiceError(400, "SEARCH_UNAVAILABLE", "Entity has no searchable fields");
}

function responseProjection(descriptor: EntityRuntimeDescriptor, readableFields: readonly EntityFieldDescriptor[], query: ListRecordsQuery): readonly EntityFieldDescriptor[] {
  const byKey = new Map(readableFields.map((field) => [field.key, field]));
  const requested = query.fields === undefined ? readableFields.map((field) => field.key) : [...new Set(query.fields)];
  const configuredIdentity = descriptor.listPresentation?.identityField;
  const storageIdentity = readableFields.find((field) => field.storagePath === descriptor.storage.idField)?.key;
  const identity = configuredIdentity && byKey.has(configuredIdentity) ? configuredIdentity : storageIdentity;
  for (const required of [identity, query.group]) if (required && !requested.includes(required)) requested.push(required);
  return Object.freeze(requested.flatMap((key) => { const field = byKey.get(key); return field ? [field] : []; }));
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
): Promise<Extract<AuthorizationDecision, { readonly allowed: true }>> {
  if (!permissionCode) throw new RecordServiceError(409, "ENTITY_OPERATION_UNAVAILABLE", "Entity operation is not published");
  const decision = await authorizer.authorize({ context, permissionCode, resource });
  if (!decision.allowed) throw new RecordServiceError(403, "FORBIDDEN", "Record operation is not permitted");
  return decision;
}
