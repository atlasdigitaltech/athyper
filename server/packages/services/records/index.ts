/**
 * @athyper/svc-records
 *
 * Intentional fan-in: this service depends on svc-business, svc-finance,
 * svc-iam, and svc-policy because record operations (CRUD, bulk actions,
 * import, export, entity-level actions) are the integration layer where all
 * domain concerns converge:
 *
 *   svc-iam      — permission checks on every mutating route
 *   svc-policy   — pre-save policy evaluation (deny / require_workflow guards)
 *   svc-business — AP invoice extraction, proforma promotion, business logic
 *   svc-finance  — journal posting triggered by record state transitions
 *
 * If this fan-in depth ever grows past 4, extract a dedicated svc-orchestration
 * layer rather than adding more direct dependencies here.
 */

export { registerRecordsRoutes, type RecordsRoutesDeps } from "./routes/index.js";
export { EntityQueryService, type EntityQueryServiceDeps } from "./query/entity-query.service.js";
export { KyselyEntityQueryExecutor } from "./query/entity-query.kysely.js";
export { KyselyEntityQueryScopeResolver } from "./query/entity-query-scope.kysely.js";
export { DescriptorReferenceLabelResolver } from "./query/descriptor-reference-resolver.js";
export { encodeKeysetCursor, decodeKeysetCursor, InvalidKeysetCursorError } from "./query/keyset-cursor.js";
export { hydrateEntityReferences, type ReferenceLabelResolver, type ReferenceLabelBatch } from "./query/reference-hydrator.js";
export type * from "./query/entity-query.types.js";
export { entityListVersionKey } from "./cache/list-cache.js";
export * from "./query/entity-query-runtime-config.js";
export {
  createEntityMutationService,
  DefaultEntityMutationService,
  DOCUMENT_WORKSPACE_AGGREGATE_HANDLER,
  type EntityMutationHandlerRegistry,
  type EntityMutationServiceDeps,
} from "./mutation/entity-mutation.service.js";
export {
  type AggregateChangeSet,
  type AggregateCollectionChangeSet,
  type AggregateMutationCommand,
  type CreateEntityCommand,
  type DeleteEntityCommand,
  type EntityMutationService,
  type MutationOrigin,
  type MutationResult,
  type MutationValidationMode,
  type PatchEntityCommand,
  type TransitionEntityCommand,
} from "./mutation/entity-mutation.types.js";
export { mapMutationResultToHttp, type MutationHttpResponse } from "./mutation/entity-mutation-http.js";
export {
  AggregateCollectionPlanError,
  compileAggregateCollectionExecutionPlan,
  type AggregateCollectionExecutionStep,
  type AggregateCollectionOperation,
} from "./mutation/aggregate-collection-executor.js";
export {
  hasFieldViolations,
  mergeFieldViolations,
  validateCompiledWriteFields,
  validateEntityWriteFields,
  type MutationFieldDecision,
  type MutationFieldViolationReason,
  type MutationFieldViolations,
  type StrictOrLenientValidationMode,
} from "./mutation/field-validation.js";
export {
  BUILTIN_ENTITY_MUTATION_HANDLER_NAMES,
  getEntityMutationHandler,
  listEntityMutationHandlers,
  registerEntityMutationHandler,
  runEntityMutationHandlerBeforePersist,
  type EntityMutationHandler,
  type MutationHookContext,
  type TransactionalMutationContext,
  type ValidationIssue,
} from "./mutation/entity-mutation-handler.registry.js";
export {
  entityHandlerRegistryFamily,
  ValidatedEntityHandlerRegistryFamily,
  type EntityHandlerRegistryKind,
} from "./mutation/handler-registry-family.js";

import { listWriteFacades } from "./routes/write-facade.registry.js";
import { listEntityMutationHandlers } from "./mutation/entity-mutation-handler.registry.js";
import { entityHandlerRegistryFamily as handlerRegistryFamily } from "./mutation/handler-registry-family.js";
import { DOCUMENT_WORKSPACE_AGGREGATE_HANDLER as documentWorkspaceAggregateHandler } from "./mutation/entity-mutation.service.js";

/** Deployment-time registry projection consumed by the metadata compiler. */
export function getRecordsCapabilityHandlerManifest(): {
  writeFacades: string[];
  mutationHandlers: string[];
  lifecycleHandlers: string[];
  attachmentProviders: string[];
  collectionHandlers: string[];
} {
  return {
    writeFacades: listWriteFacades(),
    mutationHandlers: [documentWorkspaceAggregateHandler, ...listEntityMutationHandlers()].sort(),
    lifecycleHandlers: [],
    attachmentProviders: [],
    collectionHandlers: [],
  };
}

export function getRecordsHandlerRegistryHealth() {
  return handlerRegistryFamily.health();
}
export * from "./lifecycle/execute-lifecycle-transition.js";
export * from "./mutation/entity-mutation-outbox.handler.js";
