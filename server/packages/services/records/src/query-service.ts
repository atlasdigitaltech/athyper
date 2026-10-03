import { authorizeEntityOperation } from "@athyper/server-contract-auth";
import { isEntityRecordId } from "@athyper/contract-platform-entity-runtime";
import {
  prepareRecordOwnerAccess,
  scopeRecordOwnerRead,
  type RecordOwnerAccessAdapter,
} from "./record-owner-access.js";
import { executeAuthorizedAggregate } from "./authorized-aggregate.js";
import { MAX_LIST_FILTERS } from "./list-limits.js";
import { validateFilterValue } from "./filter-value-validation.js";
import { usesEntityBackendAuthorization } from "./entity-backend-authorizer.js";
import { entityAuthorizationProfileHash } from "./entity-authorization-rollout.js";
import { createHash } from "node:crypto";
import type {
  AuthorizationDecision,
  Authorizer,
} from "@athyper/server-contract-auth";
import type {
  EntityFieldDescriptor,
  EntityRuntimeDescriptor,
  MetadataReader,
} from "@athyper/server-contract-metadata";
import type {
  GetRecordQuery,
  AuthorizedRecordDetailResult,
  ListRecordsQuery,
  RecordCollectionScopeResolution,
  RecordCollectionScopeResolver,
  RecordListResult,
  RecordQueryService,
  RecordRepository,
  RecordTransactionCoordinator,
} from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";
import { recordFieldFilterOperators } from "./list-query-policy.js";
import {
  authorizeRecordListRead,
  readableRecordFields,
  projectAuthorizedRecordFields,
} from "./record-read-access.js";

export interface RecordQueryServiceOptions<Transaction = unknown> {
  readonly ownerAccess?: RecordOwnerAccessAdapter<Transaction>;
  readonly metadata: MetadataReader;
  readonly authorizer: Authorizer;
  readonly repository: RecordRepository<Transaction>;
  readonly transactions: RecordTransactionCoordinator<Transaction>;
  readonly collectionScopes?: RecordCollectionScopeResolver;
}

export interface ExecutedRecordList {
  readonly descriptor: EntityRuntimeDescriptor;
  readonly collectionScope: Extract<
    RecordCollectionScopeResolution,
    { readonly status: "ready" }
  >;
  readonly authorization: Extract<
    AuthorizationDecision,
    { readonly allowed: true }
  >;
  readonly readableFields: readonly EntityFieldDescriptor[];
  readonly responseFields: readonly EntityFieldDescriptor[];
  readonly result: RecordListResult;
}

export interface RecordListExecutor {
  execute(query: ListRecordsQuery): Promise<ExecutedRecordList>;
}

export function createRecordListExecutor<Transaction = unknown>(
  options: RecordQueryServiceOptions<Transaction>,
): RecordListExecutor {
  return Object.freeze({
    async execute(query: ListRecordsQuery) {
      const descriptor = await descriptorFor(
        options.metadata,
        query.context,
        query.entityCode,
      );
      const enforced = usesEntityBackendAuthorization(
        options.authorizer,
        query.context,
        descriptor,
      );
      const collectionScope = await resolveCollectionScope(
        options.collectionScopes,
        query,
        descriptor,
      );
      if (collectionScope.status === "context_required")
        throw new RecordServiceError(
          409,
          "RECORD_LIST_SCOPE_REQUIRED",
          "Select a validated work context before listing scoped records",
        );
      if (collectionScope.status === "forbidden")
        throw new RecordServiceError(
          403,
          collectionScope.code,
          collectionScope.message,
        );
      const authorization = await authorizeRecordListRead(
        options.authorizer,
        query.context,
        descriptor,
        collectionScope.authorizationResource,
      );
      if (
        authorization.scope &&
        !authorization.scope.tenantWide &&
        !collectionScope.constraints.length &&
        descriptor.directoryScope?.mode !== "tenant"
      )
        throw new RecordServiceError(
          409,
          "RECORD_LIST_SCOPE_REQUIRED",
          "The selected work context has no registered collection-scope resolver",
        );
      const readableFields = await readableRecordFields(
        options.authorizer,
        query.context,
        descriptor,
      );
      const readableKeys = new Set(readableFields.map((field) => field.key));
      validateQueryFields(descriptor.fields, query, readableKeys);
      const responseFields = responseProjection(
        descriptor,
        readableFields,
        query,
      );
      if (enforced) {
        const authorizationFieldUses = [
          ...responseFields.map((field) => ({ field: field.key, use: "read" })),
          ...(query.filters ?? []).map((filter) => ({
            field: filter.field,
            use: "filter",
          })),
          ...(query.sort ?? []).map((sort) => ({
            field: sort.field,
            use: "sort",
          })),
          ...(query.group ? [{ field: query.group, use: "group" }] : []),
          ...(query.search
            ? readableFields
                .filter((field) => field.searchable)
                .map((field) => ({ field: field.key, use: "search" }))
            : []),
        ];
        const directory = descriptor.authorization!.operations.find(
          (operation) =>
            operation.key === descriptor.authorization!.directory.operation,
        )!;
        const permitted = await authorizeEntityOperation(options.authorizer, {
          context: query.context,
          permissionCode: directory.permissionCode,
          resource: {
            ...collectionScope.authorizationResource,
            tenantId: query.context.tenantId,
            entityCode: descriptor.entityCode,
            operationKey: directory.key,
            authorizationFieldUses,
            authorizationProfileHash: entityAuthorizationProfileHash(
              descriptor.authorization!,
            ),
            authorizationDescriptorHash: descriptor.compiledHash,
          },
        });
        if (!permitted.allowed)
          throw new RecordServiceError(
            403,
            "ENTITY_FIELD_QUERY_FORBIDDEN",
            "Requested field use is not permitted",
          );
      }
      const projection = [
        ...new Set([
          ...responseFields.map((field) => field.key),
          ...(query.sort ?? []).map((sort) => sort.field),
        ]),
      ];
      const limit = query.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new RecordServiceError(
          400,
          "INVALID_LIMIT",
          "Record list limit must be between 1 and 100",
        );
      const maxSortLevels =
        descriptor.listPresentation?.limits?.maxSortLevels ?? 3;
      if ((query.sort?.length ?? 0) > maxSortLevels)
        throw new RecordServiceError(
          400,
          "TOO_MANY_SORT_FIELDS",
          `Record lists support at most ${maxSortLevels} sort fields`,
        );
      if ((query.filters?.length ?? 0) > MAX_LIST_FILTERS)
        throw new RecordServiceError(
          400,
          "TOO_MANY_FILTERS",
          `Record lists support at most ${MAX_LIST_FILTERS} filters`,
          { max: MAX_LIST_FILTERS },
        );
      if (
        (query.recordIds?.length ?? 0) > 100 ||
        query.recordIds?.some((id) => !isEntityRecordId(id))
      )
        throw new RecordServiceError(
          400,
          "INVALID_RECORD_IDS",
          "Record identity restrictions must contain at most one hundred UUIDs",
        );
      if (query.search && query.search.length > 512)
        throw new RecordServiceError(
          400,
          "SEARCH_TOO_LONG",
          "Record search must not exceed 512 characters",
        );
      const minimumQueryLength =
        descriptor.listPresentation?.search?.minimumQueryLength ?? 1;
      if (query.search && query.search.trim().length < minimumQueryLength)
        throw new RecordServiceError(
          400,
          "SEARCH_TOO_SHORT",
          `Record search must contain at least ${minimumQueryLength} characters`,
        );
      if (query.hydrateReferences)
        throw new RecordServiceError(
          409,
          "REFERENCE_HYDRATION_UNAVAILABLE",
          "Reference hydration is not available for this list endpoint",
        );
      const aggregateAuthorizationCovered =
        enforced &&
        Boolean(
          options.authorizer.aggregateAuthorizationCovered?.(
            query.context,
            descriptor,
          ),
        );
      const repositoryResult = await options.transactions.run(
        query.context.planeKey,
        {
          tenantId: query.context.tenantId,
          principalId: query.context.principalId,
        },
        async (transaction) => {
          const ownerValues = await prepareRecordOwnerAccess(
            options.ownerAccess,
            { context: query.context, descriptor, operation: "list" },
            transaction,
          );
          const input = {
            descriptor: {
              ...scopeRecordOwnerRead(descriptor, ownerValues),
              // Both SQL and in-memory repositories derive search predicates from this
              // descriptor. Hidden fields must not influence matches or exact counts.
              fields: descriptor.fields.map((field) =>
                field.searchable && !readableKeys.has(field.key)
                  ? { ...field, searchable: false }
                  : field,
              ),
            },
            tenantId: query.context.tenantId,
            limit,
            filters: query.filters ?? [],
            sort: query.sort ?? [],
            countMode: query.countMode ?? "none",
            projection,
            cursorScope: cursorScope(query.context, collectionScope),
            collectionScope: collectionScope.constraints,
            ...(query.viewRelationships
              ? { viewRelationships: query.viewRelationships }
              : {}),
            ...(query.recordIds !== undefined
              ? { recordIds: Object.freeze([...new Set(query.recordIds)]) }
              : {}),
            ...(query.group ? { group: query.group } : {}),
            ...(query.cursor ? { cursor: query.cursor } : {}),
            ...(query.search ? { search: query.search } : {}),
          };
          if (
            enforced &&
            (query.group || (query.countMode && query.countMode !== "none"))
          )
            return executeAuthorizedAggregate({
              repository: options.repository,
              query: input,
              transaction,
              authorize: aggregateAuthorizationCovered
                ? async () => true
                : async (recordId) => {
                    const decision = await authorizeEntityOperation(options.authorizer, {
                      context: query.context,
                      permissionCode:
                        descriptor.operations["read"]!.permissionCode,
                      resource: {
                        ...collectionScope.authorizationResource,
                        tenantId: query.context.tenantId,
                        entityCode: descriptor.entityCode,
                        resourceCode: descriptor.entityCode,
                        operationKey: "read",
                        authorizationProfileHash:
                          entityAuthorizationProfileHash(
                            descriptor.authorization!,
                          ),
                        authorizationDescriptorHash: descriptor.compiledHash,
                        recordId,
                      },
                    });
                    if (
                      !decision.allowed &&
                      [
                        "entity_authorization_unavailable",
                        "entity_authorization_unmapped",
                      ].includes(decision.reason ?? "")
                    )
                      throw new RecordServiceError(
                        503,
                        "ENTITY_AGGREGATE_AUTHORIZATION_UNAVAILABLE",
                        "Aggregate authorization is unavailable",
                      );
                    return decision.allowed;
                  },
            });
          const result = await options.repository.list(input, transaction);
          return result;
        },
      );
      if (enforced && !aggregateAuthorizationCovered) {
        for (const row of repositoryResult.data) {
          const id = row[descriptor.storage.idField];
          if (typeof id !== "string" && typeof id !== "number")
            throw new RecordServiceError(
              403,
              "ENTITY_RECORD_IDENTITY_REQUIRED",
              "Record authorization identity is unavailable",
            );
          await authorizeRecordListRead(
            options.authorizer,
            query.context,
            descriptor,
            { ...collectionScope.authorizationResource, recordId: String(id) },
          );
        }
      }
      const result = restrictResponseProjection(
        repositoryResult,
        descriptor,
        responseFields,
        enforced,
      );
      return Object.freeze({
        descriptor,
        collectionScope,
        authorization,
        readableFields,
        responseFields,
        result,
      });
    },
  });
}



function restrictResponseProjection(
  result: RecordListResult,
  descriptor: EntityRuntimeDescriptor,
  responseFields: readonly EntityFieldDescriptor[],
  enforced = false,
): RecordListResult {
  const visible = new Set<string>(responseFields.map((field) => field.key));
  if (enforced)
    for (const row of result.data)
      assertProfiledScalarProjection(row, [...visible]);
  // Repository-only storage coordinates are retained for the record envelope and
  // optimistic concurrency, but query-internal sort columns never escape.
  for (const key of [
    descriptor.storage.idField,
    descriptor.storage.versionField,
    descriptor.storage.statusField,
  ])
    if (key) visible.add(key);
  return Object.freeze({
    ...result,
    data: Object.freeze(
      result.data.map((row) =>
        Object.freeze(
          projectAuthorizedRecordFields(
            descriptor,
            Object.fromEntries(
              Object.entries(row).filter(([key]) => visible.has(key)),
            ),
            enforced,
          ),
        ),
      ),
    ),
  });
}

export function createRecordQueryService<Transaction = unknown>(
  options: RecordQueryServiceOptions<Transaction>,
  listExecutor: RecordListExecutor = createRecordListExecutor(options),
): RecordQueryService {
  const getWithProjection = async (query: GetRecordQuery): Promise<AuthorizedRecordDetailResult> => {
      const descriptor = await descriptorFor(
        options.metadata,
        query.context,
        query.entityCode,
      );
      const enforced = usesEntityBackendAuthorization(
        options.authorizer,
        query.context,
        descriptor,
      );
      if (descriptor.directoryScope || descriptor.collectionRelationship) {
        await authorizeRecordListRead(
          options.authorizer,
          query.context,
          descriptor,
          { recordId: query.recordId },
        );
        const result = await listExecutor.execute({
          context: query.context,
          entityCode: query.entityCode,
          recordIds: [query.recordId],
          limit: 1,
        });
        return { data: result.result.data[0] ?? null, descriptor: result.descriptor, readableFields: result.readableFields };
      }
      await authorize(
        options.authorizer,
        query.context,
        descriptor.operations["read"]?.permissionCode,
        {
          tenantId: query.context.tenantId,
          entityCode: query.entityCode,
          operationKey: "read",
          resourceCode: query.entityCode,
          recordId: query.recordId,
          ...(descriptor.authorization
            ? {
                authorizationProfileHash: entityAuthorizationProfileHash(
                  descriptor.authorization,
                ),
                authorizationDescriptorHash: descriptor.compiledHash,
              }
            : {}),
        },
      );
      const readableFields = await readableRecordFields(options.authorizer, query.context, descriptor);
      const projection = readableFields.map(field => field.key);
      const data = await options.transactions.run(
        query.context.planeKey,
        {
          tenantId: query.context.tenantId,
          principalId: query.context.principalId,
        },
        async (transaction) => {
          const ownerValues = await prepareRecordOwnerAccess(
            options.ownerAccess,
            { context: query.context, descriptor, operation: "read" },
            transaction,
          );
          const record = await options.repository.get(
            scopeRecordOwnerRead(descriptor, ownerValues),
            query.context.tenantId,
            query.recordId,
            projection,
            transaction,
          );
          return record;
        },
      );
      if (data && enforced) assertProfiledScalarProjection(data, projection);
      return {
        descriptor,
        readableFields,
        data: data
          ? projectAuthorizedRecordFields(descriptor, data, enforced)
          : null,
      };
  };
  return {
    async list(query) { return (await listExecutor.execute(query)).result; },
    async get(query) { return { data: (await getWithProjection(query)).data }; },
    getWithProjection,
  };
}

function cursorScope(
  context: ListRecordsQuery["context"],
  scope: Extract<RecordCollectionScopeResolution, { readonly status: "ready" }>,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        planeKey: context.planeKey,
        tenantId: context.tenantId,
        principalFingerprint: context.permissions.principalFingerprint,
        authEpoch: context.authEpoch,
        profileHash: context.profileHash,
        schemaHash: context.permissions.schemaHash,
        collectionScope: scope.fingerprintMaterial,
      }),
    )
    .digest("hex");
}

async function resolveCollectionScope(
  resolver: RecordCollectionScopeResolver | undefined,
  query: ListRecordsQuery,
  descriptor: Awaited<ReturnType<typeof descriptorFor>>,
): Promise<RecordCollectionScopeResolution> {
  if (
    !resolver &&
    (query.scopeCoordinate?.parentEntityCode ||
      query.scopeCoordinate?.parentRecordId ||
      query.scopeCoordinate?.relationshipKey || query.scopeCoordinate?.parentDescriptorHash)
  )
    throw new RecordServiceError(
      403,
      "ENTITY_PARENT_ACCESS_DENIED",
      "Related record scope is unavailable",
    );
  if (resolver)
    return resolver.resolve({
      context: query.context,
      descriptor,
      operationCode: "read",
      ...(query.scopeCoordinate ? { coordinate: query.scopeCoordinate } : {}),
    });
  if (descriptor.collectionRelationship)
    throw new RecordServiceError(
      409,
      "COLLECTION_SCOPE_RESOLVER_REQUIRED",
      "Document collection scope resolver is required",
    );
  if (descriptor.directoryScope && descriptor.directoryScope.mode !== "tenant")
    throw new RecordServiceError(
      409,
      "DIRECTORY_SCOPE_RESOLVER_REQUIRED",
      "Directory scope resolver is required",
    );
  return Object.freeze({
    status: "ready",
    authorizationResource: Object.freeze({}),
    constraints: Object.freeze([]),
    labels: Object.freeze([]),
    fingerprintMaterial: Object.freeze({ mode: "tenant" }),
  });
}

function validateQueryFields(
  fields: readonly EntityFieldDescriptor[],
  query: ListRecordsQuery,
  readable: ReadonlySet<string>,
): void {
  const map = new Map(fields.map((field) => [field.key, field]));
  for (const filter of query.filters ?? []) {
    validateFilterValue(filter);
    const field = map.get(filter.field);
    if (!field?.filterable || !readable.has(filter.field))
      throw new RecordServiceError(
        400,
        "FILTER_FIELD_NOT_ALLOWED",
        `Field is not filterable: ${filter.field}`,
      );
    if (!recordFieldFilterOperators(field).includes(filter.operator))
      throw new RecordServiceError(
        400,
        "FILTER_OPERATOR_NOT_ALLOWED",
        `Operator is not available for field: ${filter.field}`,
      );
  }
  for (const sort of query.sort ?? [])
    if (!map.get(sort.field)?.sortable || !readable.has(sort.field))
      throw new RecordServiceError(
        400,
        "SORT_FIELD_NOT_ALLOWED",
        `Field is not sortable: ${sort.field}`,
      );
  if (query.group) {
    const field = fields.find((candidate) => candidate.key === query.group);
    if (!field?.list?.groupable || !readable.has(query.group))
      throw new RecordServiceError(
        400,
        "GROUP_FIELD_NOT_ALLOWED",
        `Field is not groupable: ${query.group}`,
      );
  }
  if ((query.fields?.length ?? 0) > 100)
    throw new RecordServiceError(
      400,
      "TOO_MANY_PROJECTION_FIELDS",
      "Record lists support at most one hundred response fields",
    );
  for (const field of query.fields ?? [])
    if (!map.has(field) || !readable.has(field))
      throw new RecordServiceError(
        400,
        "PROJECTION_FIELD_NOT_ALLOWED",
        `Field is not readable: ${field}`,
      );
  if (
    query.search &&
    !fields.some((field) => field.searchable && readable.has(field.key))
  )
    throw new RecordServiceError(
      400,
      "SEARCH_UNAVAILABLE",
      "Entity has no searchable fields",
    );
}

function responseProjection(
  descriptor: EntityRuntimeDescriptor,
  readableFields: readonly EntityFieldDescriptor[],
  query: ListRecordsQuery,
): readonly EntityFieldDescriptor[] {
  const byKey = new Map(readableFields.map((field) => [field.key, field]));
  const requested =
    query.fields === undefined
      ? readableFields.map((field) => field.key)
      : [...new Set(query.fields)];
  const configuredIdentity = descriptor.listPresentation?.identityField;
  const storageIdentity = readableFields.find(
    (field) => field.storagePath === descriptor.storage.idField,
  )?.key;
  const identity =
    configuredIdentity && byKey.has(configuredIdentity)
      ? configuredIdentity
      : storageIdentity;
  for (const required of [identity, query.group])
    if (required && !requested.includes(required)) requested.push(required);
  return Object.freeze(
    requested.flatMap((key) => {
      const field = byKey.get(key);
      return field ? [field] : [];
    }),
  );
}

export async function descriptorFor(
  metadata: MetadataReader,
  context: Parameters<MetadataReader["getEntityDescriptor"]>[0],
  entityCode: string,
) {
  const descriptor = await metadata.getEntityDescriptor(context, entityCode);
  if (!descriptor)
    throw new RecordServiceError(
      404,
      "ENTITY_DESCRIPTOR_NOT_FOUND",
      `No active descriptor for ${entityCode}`,
    );
  return descriptor;
}

export async function authorize(
  authorizer: Authorizer,
  context: Parameters<Authorizer["authorize"]>[0]["context"],
  permissionCode: string | undefined,
  resource: Readonly<Record<string, unknown>>,
): Promise<Extract<AuthorizationDecision, { readonly allowed: true }>> {
  const decision = await authorizeEntityOperation(authorizer, {
    context,
    permissionCode,
    resource,
  });
  if (!decision.allowed)
    throw new RecordServiceError(
      403,
      "FORBIDDEN",
      "Record operation is not permitted",
    );
  return decision;
}

/** Nested JSON requires an owning provider profile, not a root scalar field grant. */
function assertProfiledScalarProjection(
  row: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): void {
  if (
    fields.some(
      (field) =>
        row[field] !== null &&
        typeof row[field] === "object" &&
        !(row[field] instanceof Date),
    )
  )
    throw new RecordServiceError(
      403,
      "ENTITY_NESTED_PROVIDER_REQUIRED",
      "Nested values require an authorized provider projection",
    );
}
