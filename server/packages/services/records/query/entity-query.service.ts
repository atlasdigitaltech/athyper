import { createHash } from "node:crypto";
import { withFrameworkPhase } from "@athyper/adapter-telemetry";
import type { ExecutionDescriptorV1 } from "@athyper/svc-metadata";
import { buildEntityKeysetListCacheKey, stableEntityListCacheHash } from "../cache/list-cache.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "./keyset-cursor.js";
import { hydrateEntityReferences, type ReferenceLabelResolver } from "./reference-hydrator.js";
import type {
  CompiledEntityQueryPlan,
  EntityCountCache,
  EntityCountMode,
  EntityDetailResult,
  EntityListResult,
  EntityListResultCache,
  EntityQueryExecutor,
  EntityQueryFilter,
  EntityQuerySort,
  GetEntityDetailCommand,
  ListEntitiesCommand,
  QueryPredicate,
} from "./entity-query.types.js";
import { EntityQueryValidationError } from "./entity-query.types.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export interface EntityQueryServiceDeps {
  readonly executor: EntityQueryExecutor;
  readonly cursorSecret: string;
  readonly countCache?: EntityCountCache;
  readonly references?: ReferenceLabelResolver;
  readonly resultCache?: EntityListResultCache;
}

export class EntityQueryService {
  constructor(private readonly deps: EntityQueryServiceDeps) {
    if (!deps.cursorSecret) throw new Error("EntityQueryService requires a non-empty cursor secret.");
  }

  async list(command: ListEntitiesCommand): Promise<EntityListResult> {
    return withFrameworkPhase("query", () => this.listMeasured(command));
  }

  private async listMeasured(command: ListEntitiesCommand): Promise<EntityListResult> {
    assertContext(command);
    const limit = normalizeLimit(command.limit);
    const sort = compileSort(command.descriptor, command.sort);
    const cursor = command.cursor ? decodeKeysetCursor(command.cursor, this.deps.cursorSecret) : undefined;
    if (cursor && (cursor.entity !== command.descriptor.identity.entityCode
      || cursor.descriptorHash !== command.descriptor.identity.compiledHash
      || cursor.sort.join("\0") !== sort.map(sortIdentity).join("\0")
      || cursor.values.length !== sort.length)) {
      throw new EntityQueryValidationError("CURSOR_DESCRIPTOR_MISMATCH", "Cursor does not match the active entity query contract.");
    }
    const plan = compilePlan(command, sort, limit + 1, cursor?.values);
    const resultCacheKey = buildResultKey(command, plan, limit, sort);
    const cachedResult = await this.deps.resultCache?.get(resultCacheKey);
    if (cachedResult) return cachedResult;
    const raw = await this.deps.executor.executeData(plan);
    const hasMore = raw.length > limit;
    const page = raw.slice(0, limit).map((row) => applyDescriptorMask(command.descriptor, row));
    const data = command.hydrateReferences === false
      ? page
      : await hydrateEntityReferences(command.descriptor, page, this.deps.references, command.context);
    const countMode = resolveCountMode(command);
    const total = await this.resolveCount(plan, command, countMode);
    const last = page.at(-1);
    const nextCursor = hasMore && last
      ? encodeKeysetCursor({
          v: 1,
          entity: command.descriptor.identity.entityCode,
          descriptorHash: command.descriptor.identity.compiledHash,
          sort: sort.map(sortIdentity),
          values: sort.map((entry) => last[entry.field]),
        }, this.deps.cursorSecret)
      : undefined;
    const result: EntityListResult = {
      data,
      pagination: {
        page_size: limit,
        has_more: hasMore,
        ...(nextCursor ? { next_cursor: nextCursor } : {}),
        ...(total === undefined ? {} : { total }),
        count_mode: countMode,
      },
    };
    await this.deps.resultCache?.set(resultCacheKey, result);
    return result;
  }

  async detail(command: GetEntityDetailCommand): Promise<EntityDetailResult> {
    return withFrameworkPhase("query", () => this.detailMeasured(command));
  }

  private async detailMeasured(command: GetEntityDetailCommand): Promise<EntityDetailResult> {
    assertContext(command);
    const field = fieldByColumn(command.descriptor, command.descriptor.storage.primaryKey);
    const plan = compilePlan({ ...command, filters: [{ field, operator: "eq", value: command.id }] }, compileSort(command.descriptor), 1);
    const [row] = await this.deps.executor.executeData(plan);
    if (!row) return { data: null };
    const masked = applyDescriptorMask(command.descriptor, row);
    const [data] = command.hydrateReferences === false
      ? [masked]
      : await hydrateEntityReferences(command.descriptor, [masked], this.deps.references, command.context);
    return { data: data ?? null };
  }

  private async resolveCount(plan: CompiledEntityQueryPlan, command: ListEntitiesCommand, mode: EntityCountMode): Promise<number | undefined> {
    if (mode === "none") return undefined;
    // Counts describe the complete filtered result set, not only the rows after
    // the current keyset cursor. Keep the data plan immutable and remove the
    // page boundary before delegating to count executors.
    const countPlan = plan.boundary === undefined ? plan : { ...plan, boundary: undefined };
    if (mode === "approximate") return this.deps.executor.executeApproximateCount?.(countPlan);
    const key = buildCountKey(command, countPlan);
    if (mode === "cached") return this.deps.countCache?.get(key);
    const cached = await this.deps.countCache?.get(key);
    if (cached !== undefined) return cached;
    const total = await this.deps.executor.executeExactCount(countPlan);
    await this.deps.countCache?.set(key, total);
    return total;
  }
}

function compilePlan(
  command: Pick<ListEntitiesCommand, "context" | "descriptor" | "filters" | "search" | "offset">,
  sort: readonly (EntityQuerySort & { column: string })[],
  limit: number,
  boundary?: readonly unknown[],
): CompiledEntityQueryPlan {
  const { descriptor, context } = command;
  if (command.offset !== undefined && (!Number.isSafeInteger(command.offset) || command.offset < 0)) {
    throw new EntityQueryValidationError("INVALID_OFFSET", "Offset must be a non-negative integer.");
  }
  if (command.offset !== undefined && command.offset > 0 && !allowsOffset(descriptor)) {
    throw new EntityQueryValidationError("OFFSET_PAGINATION_NOT_ALLOWED", "Offset pagination is restricted to explicitly bounded administrative entities.");
  }
  const predicates: QueryPredicate[] = [{ column: descriptor.storage.tenantColumn, operator: "eq", value: context.tenantId }];
  for (const filter of command.filters ?? []) predicates.push(compileFilter(descriptor, filter));
  addVerifiedScopePredicates(predicates, descriptor, context);
  addScopePredicate(predicates, descriptor, "organization_id", context.organizationId);
  const search = command.search?.trim();
  return Object.freeze({
    entityCode: descriptor.identity.entityCode,
    schema: descriptor.storage.schema,
    table: descriptor.storage.table,
    primaryKey: descriptor.storage.primaryKey,
    columns: descriptor.read.projection.map((name) => {
      const field = descriptor.fields.get(name);
      if (!field) throw new EntityQueryValidationError("INVALID_PROJECTION", `Projection field '${name}' is not compiled.`);
      return { field: name, column: field.column };
    }),
    predicates,
    ...(search ? { search: { columns: descriptor.read.searchableFields.map((name) => requiredField(descriptor, name).column), term: search } } : {}),
    sort,
    ...(boundary ? { boundary: { values: boundary } } : {}),
    limit,
    ...(command.offset ? { offset: command.offset } : {}),
  });
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 1) {
    throw new EntityQueryValidationError("INVALID_LIMIT", "Limit must be a positive integer.");
  }
  return Math.min(MAX_LIMIT, value);
}

function compileFilter(descriptor: ExecutionDescriptorV1, filter: EntityQueryFilter): QueryPredicate {
  const field = requiredField(descriptor, filter.field);
  if (!descriptor.read.filterableFields.includes(filter.field) || !field.filterable || field.computed) {
    throw new EntityQueryValidationError("FIELD_NOT_FILTERABLE", `Field '${filter.field}' is not filterable.`);
  }
  if (filter.operator === "in" && !Array.isArray(filter.value)) {
    throw new EntityQueryValidationError("INVALID_FILTER", `Filter '${filter.field}' requires an array value.`);
  }
  return { column: field.column, operator: filter.operator, ...(filter.value === undefined ? {} : { value: filter.value }) };
}

function compileSort(descriptor: ExecutionDescriptorV1, requested?: readonly EntityQuerySort[]) {
  const source = requested?.length ? requested : descriptor.read.defaultSort;
  const result = source.map((sort) => {
    const field = requiredField(descriptor, sort.field);
    if (!field.sortable || field.computed) throw new EntityQueryValidationError("FIELD_NOT_SORTABLE", `Field '${sort.field}' is not sortable.`);
    return { ...sort, column: field.column };
  });
  const tie = descriptor.read.stableTieBreaker;
  if (!result.some((entry) => entry.field === tie)) {
    const field = requiredField(descriptor, tie);
    result.push({ field: tie, column: field.column, direction: result.at(-1)?.direction ?? "asc", nulls: "last" });
  }
  return result;
}

function resolveCountMode(command: ListEntitiesCommand): EntityCountMode {
  if (command.countMode) return command.countMode;
  return ["DOCUMENT", "LEDGER", "CHILD"].includes(command.descriptor.identity.entityClass.toUpperCase()) ? "none" : "cached";
}

function applyDescriptorMask(descriptor: ExecutionDescriptorV1, row: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const policy = descriptor.policy.dataPolicy;
  const hidden = Array.isArray(policy["hiddenFields"]) ? policy["hiddenFields"] : [];
  const redacted = Array.isArray(policy["redactedFields"]) ? policy["redactedFields"] : [];
  const result = { ...row };
  for (const field of hidden) if (typeof field === "string") delete result[field];
  for (const field of redacted) if (typeof field === "string" && field in result) result[field] = null;
  return result;
}

function allowsOffset(descriptor: ExecutionDescriptorV1): boolean {
  return descriptor.policy.dataPolicy["boundedAdministrative"] === true;
}

function addScopePredicate(target: QueryPredicate[], descriptor: ExecutionDescriptorV1, column: string, value: string | undefined): void {
  if (value && [...descriptor.fields.values()].some((field) => field.column === column)) target.push({ column, operator: "eq", value });
}

function addVerifiedScopePredicates(
  target: QueryPredicate[],
  descriptor: ExecutionDescriptorV1,
  context: ListEntitiesCommand["context"],
): void {
  const mode = descriptor.policy.companyScopeMode ?? "none";
  const hasCompany = [...descriptor.fields.values()].some((field) => field.column === "company_code_id");
  const hasLegalEntity = [...descriptor.fields.values()].some((field) => field.column === "legal_entity_id");
  if (context.companyCodeId && hasCompany) {
    target.push({ column: "company_code_id", operator: "eq", value: context.companyCodeId });
    return;
  }
  if (context.legalEntityId && hasLegalEntity) {
    target.push({ column: "legal_entity_id", operator: "eq", value: context.legalEntityId });
    return;
  }
  if ((context.legalEntityId && hasCompany) || (context.companyCodeId && hasLegalEntity)) {
    throw new EntityQueryValidationError("SCOPE_PLAN_UNSUPPORTED", "Verified organization scope requires a compiled company/legal-entity expansion for this entity.");
  }
  if (mode === "none" || mode === "full") return;
  if (mode === "subtree") {
    throw new EntityQueryValidationError("SCOPE_PLAN_UNSUPPORTED", "Subtree row scope requires a compiled scope expansion and cannot use the P5 pilot path yet.");
  }
  throw new EntityQueryValidationError("SCOPE_PLAN_UNSUPPORTED", `Entity '${descriptor.identity.entityCode}' requires '${mode}' row scope but has no directly enforceable verified scope column.`);
}

function requiredField(descriptor: ExecutionDescriptorV1, name: string) {
  const field = descriptor.fields.get(name);
  if (!field) throw new EntityQueryValidationError("UNKNOWN_FIELD", `Unknown field '${name}'.`);
  return field;
}

function fieldByColumn(descriptor: ExecutionDescriptorV1, column: string): string {
  const match = [...descriptor.fields.values()].find((field) => field.column === column);
  if (!match) throw new EntityQueryValidationError("PRIMARY_KEY_NOT_PROJECTED", "Descriptor primary key is not represented by a compiled field.");
  return match.name;
}

function sortIdentity(sort: EntityQuerySort): string {
  return `${sort.field}:${sort.direction}:${sort.nulls}`;
}

function buildCountKey(command: ListEntitiesCommand, plan: CompiledEntityQueryPlan): string {
  return ["entityquery-count:v1", command.context.planeKey, command.context.tenantId, plan.entityCode,
    command.generation, command.descriptor.identity.compiledHash, securityHash(command),
    stableEntityListCacheHash(plan.predicates), stableEntityListCacheHash(plan.search)].join(":");
}

function buildResultKey(
  command: ListEntitiesCommand,
  plan: CompiledEntityQueryPlan,
  pageSize: number,
  sort: readonly EntityQuerySort[],
): string {
  return buildEntityKeysetListCacheKey({
    tenantId: command.context.tenantId,
    entityCode: plan.entityCode,
    generation: command.generation,
    version: command.generation,
    scopeHash: stableEntityListCacheHash([command.context.organizationId, command.context.companyCodeId, command.context.legalEntityId]),
    securityHash: securityHash(command),
    descriptorHash: command.descriptor.identity.compiledHash,
    filterHash: stableEntityListCacheHash([plan.predicates, command.countMode, command.hydrateReferences]),
    sortHash: stableEntityListCacheHash(sort),
    searchHash: stableEntityListCacheHash(plan.search),
    cursor: command.cursor ?? "",
    pageSize,
  });
}

function securityHash(command: ListEntitiesCommand): string {
  return createHash("sha256").update(JSON.stringify([
    command.context.profileHash, command.context.authEpoch, command.context.organizationId,
    command.context.companyCodeId, command.context.legalEntityId,
  ])).digest("hex");
}

function assertContext(command: { context: ListEntitiesCommand["context"]; descriptor: ExecutionDescriptorV1 }): void {
  if (!command.context.tenantId || !command.context.principalId || !command.context.profileHash) {
    throw new EntityQueryValidationError("VERIFIED_CONTEXT_REQUIRED", "A complete verified request context is required.");
  }
}
