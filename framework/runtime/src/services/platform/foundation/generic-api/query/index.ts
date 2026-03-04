/**
 * Generic API Query Module
 *
 * Provides cross-entity query capabilities with:
 * - Safe Query DSL
 * - Join planning and validation
 * - Security enforcement
 * - Kysely integration
 * - REST API endpoints
 */

export * from "./query-dsl.js";
export * from "./join-planner.js";
export {
  GenericQueryService,
  QueryTimeoutError,
  type QueryExecutionOptions,
  type QueryContext,
} from "./query.service.js";
export * from "./query.routes.js";
export * from "./query.observability.js";
export * from "./meta-registry.js";
