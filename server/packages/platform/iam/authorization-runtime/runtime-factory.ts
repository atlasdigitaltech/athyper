import type { Kysely } from "kysely";

import { CanonicalConsumerAuthorization } from "./consumer-enforcement.js";
import {
  NoopAuthorizationDecisionAuditSink,
  ProductionAuthorizationDecisionService,
} from "./decision.service.js";
import {
  NormalizedOperationScopeAuthorizationRepository,
  type NormalizedEntitlementResolver,
} from "./normalized-operation-scope-repository.js";
import {
  OperationScopeShadowComparator,
  OperationScopeShadowDecisionApi,
  RetiredLegacyOperationScopeDecisionApi,
  type OperationScopeRolloutResolver,
} from "./operation-scope-shadow.js";
import {
  ProductionAuthorizationSessionV2Service,
  SqlSessionV2CatalogRepository,
  SqlSessionV2IdentityRepository,
} from "./session-v2.js";
import { SqlAuthorizationDecisionAuditSink } from "./sql-audit-sink.js";
import { SqlOperationScopeShadowSink } from "./sql-operation-scope-shadow-sink.js";
import {
  createMeshSqlAuthorizationRepository,
  createNeonSqlAuthorizationRepository,
} from "./sql-repository.js";
import type {
  AuthorizationDecisionMetrics,
  ProductionAuthorizationDecisionApi,
} from "./types.js";

type AnyDb = Kysely<Record<string, never>>;

export interface CanonicalAuthorizationRuntime {
  readonly decisions: ProductionAuthorizationDecisionApi;
  readonly consumers: CanonicalConsumerAuthorization;
  readonly sessions: ProductionAuthorizationSessionV2Service;
}

export interface RuntimeFactoryBase {
  readonly expectedDatabaseName: string;
  readonly evaluatorRevision: string;
  readonly metrics?: AuthorizationDecisionMetrics;
  readonly sessionMaxTtlSeconds?: number;
}

export function createNeonAuthorizationRuntime(
  input: RuntimeFactoryBase & {
    readonly db: AnyDb;
    readonly plane: "neon" | "admin";
  },
): CanonicalAuthorizationRuntime {
  assertFactoryInput(input.expectedDatabaseName, input.evaluatorRevision);
  if (!input.db) throw new Error("Neon database configuration is required");
  const repository = createNeonSqlAuthorizationRepository({
    db: input.db,
    plane: input.plane,
    expectedDatabaseName: input.expectedDatabaseName,
    expectedEvaluatorRevision: input.evaluatorRevision,
    requiredReleaseState: "active",
  });
  return assemble(
    input.db,
    input.plane,
    repository,
    input.evaluatorRevision,
    input.metrics,
    input.sessionMaxTtlSeconds,
  );
}

export function createMeshAuthorizationRuntime(
  input: RuntimeFactoryBase & {
    /**
     * A Mesh-local client is mandatory by type and runtime check. This API has
     * no Neon client parameter and therefore cannot implement a fallback.
     */
    readonly meshDb: AnyDb;
  },
): CanonicalAuthorizationRuntime {
  assertFactoryInput(input.expectedDatabaseName, input.evaluatorRevision);
  if (!input.meshDb) throw new Error("Mesh database configuration is required");
  const repository = createMeshSqlAuthorizationRepository({
    meshDb: input.meshDb,
    expectedDatabaseName: input.expectedDatabaseName,
    expectedEvaluatorRevision: input.evaluatorRevision,
    requiredReleaseState: "active",
  });
  return assemble(
    input.meshDb,
    "mesh",
    repository,
    input.evaluatorRevision,
    input.metrics,
    input.sessionMaxTtlSeconds,
  );
}

/**
 * Explicit migration decorator. Default Neon/Mesh factories remain legacy.
 * Sessions remain on their existing capability resolver; only Entity operation
 * decisions are eligible for an exact-coordinate shadow/activation rule.
 */
export function withNormalizedOperationScopeShadow(
  legacy: CanonicalAuthorizationRuntime,
  input: {
    readonly db: AnyDb;
    readonly plane: "neon" | "mesh";
    readonly expectedDatabaseName: string;
    readonly evaluatorRevision: string;
    readonly entitlementResolver: NormalizedEntitlementResolver;
    readonly rollout: OperationScopeRolloutResolver;
    readonly metrics?: AuthorizationDecisionMetrics;
  },
): CanonicalAuthorizationRuntime {
  assertFactoryInput(input.expectedDatabaseName, input.evaluatorRevision);
  const repository = new NormalizedOperationScopeAuthorizationRepository(input.db, {
    plane: input.plane,
    expectedDatabaseName: input.expectedDatabaseName,
    entitlementResolver: input.entitlementResolver,
  });
  const candidate = new ProductionAuthorizationDecisionService(
    repository,
    // In P5-E2 the append-only comparison row is the candidate evidence.
    // Active mode is rejected below; a later activation factory must supply a
    // canonical audit sink whose FKs target the normalized permission catalog.
    new NoopAuthorizationDecisionAuditSink(),
    input.metrics,
  );
  const shadowOnlyRollout: OperationScopeRolloutResolver = {
    resolve: async (request) => {
      if (request.mode === "registered_capability") return null;
      const resolved = await input.rollout.resolve(request);
      if (resolved?.mode === "active") {
        throw new Error("normalized_authz.active_not_supported_in_p5_e2");
      }
      return resolved;
    },
  };
  const decisions = new OperationScopeShadowDecisionApi(
    legacy.decisions,
    candidate,
    shadowOnlyRollout,
    new OperationScopeShadowComparator(new SqlOperationScopeShadowSink(input.db)),
  );
  return {
    decisions,
    consumers: new CanonicalConsumerAuthorization(decisions),
    sessions: legacy.sessions,
  };
}

/**
 * P5-E6 activation boundary. The rollout resolver selects one exact operation
 * coordinate. Legacy and shadow retain the legacy result; active evaluates
 * only the normalized repository and requires durable canonical decision
 * evidence. A database switch back to legacy takes effect on the next request.
 */
export function withNormalizedOperationScopeRollout(
  legacy: CanonicalAuthorizationRuntime,
  input: {
    readonly db: AnyDb;
    readonly plane: "neon" | "mesh";
    readonly expectedDatabaseName: string;
    readonly evaluatorRevision: string;
    readonly entitlementResolver: NormalizedEntitlementResolver;
    readonly rollout: OperationScopeRolloutResolver;
    readonly metrics?: AuthorizationDecisionMetrics;
  },
): CanonicalAuthorizationRuntime {
  assertFactoryInput(input.expectedDatabaseName, input.evaluatorRevision);
  const repository = new NormalizedOperationScopeAuthorizationRepository(input.db, {
    plane: input.plane,
    expectedDatabaseName: input.expectedDatabaseName,
    entitlementResolver: input.entitlementResolver,
  });
  const shadowCandidate = new ProductionAuthorizationDecisionService(
    repository,
    new NoopAuthorizationDecisionAuditSink(),
    input.metrics,
  );
  const activeCandidate = new ProductionAuthorizationDecisionService(
    repository,
    new SqlAuthorizationDecisionAuditSink(input.db, input.plane, input.evaluatorRevision),
    input.metrics,
  );
  const decisions = new OperationScopeShadowDecisionApi(
    legacy.decisions,
    shadowCandidate,
    input.rollout,
    new OperationScopeShadowComparator(new SqlOperationScopeShadowSink(input.db)),
    activeCandidate,
  );
  return {
    decisions,
    consumers: new CanonicalConsumerAuthorization(decisions),
    sessions: legacy.sessions,
  };
}

/** Post-P5-E7 factory. Do not wire this until the retirement readiness gate is
 * green for the full plane. Entity operations cannot fall back to legacy. */
export function withRetiredLegacyOperationScope(
  capabilityRuntime:CanonicalAuthorizationRuntime,
  input:{
    readonly db:AnyDb;
    readonly plane:"neon"|"mesh";
    readonly expectedDatabaseName:string;
    readonly evaluatorRevision:string;
    readonly entitlementResolver:NormalizedEntitlementResolver;
    readonly rollout:OperationScopeRolloutResolver;
    readonly metrics?:AuthorizationDecisionMetrics;
  },
):CanonicalAuthorizationRuntime{
  assertFactoryInput(input.expectedDatabaseName,input.evaluatorRevision);
  const repository=new NormalizedOperationScopeAuthorizationRepository(input.db,{
    plane:input.plane,expectedDatabaseName:input.expectedDatabaseName,
    entitlementResolver:input.entitlementResolver,
  });
  const normalized=new ProductionAuthorizationDecisionService(
    repository,new SqlAuthorizationDecisionAuditSink(input.db,input.plane,input.evaluatorRevision),input.metrics,
  );
  const decisions=new RetiredLegacyOperationScopeDecisionApi(capabilityRuntime.decisions,normalized,input.rollout);
  return {decisions,consumers:new CanonicalConsumerAuthorization(decisions),sessions:capabilityRuntime.sessions};
}

function assemble(
  db: AnyDb,
  plane: "neon" | "admin" | "mesh",
  repository: ReturnType<typeof createNeonSqlAuthorizationRepository>,
  evaluatorRevision: string,
  metrics?: AuthorizationDecisionMetrics,
  sessionMaxTtlSeconds?: number,
): CanonicalAuthorizationRuntime {
  const audit = new SqlAuthorizationDecisionAuditSink(
    db,
    plane,
    evaluatorRevision,
  );
  const decisions = new ProductionAuthorizationDecisionService(
    repository,
    audit,
    metrics,
  );
  return {
    decisions,
    consumers: new CanonicalConsumerAuthorization(decisions),
    sessions: new ProductionAuthorizationSessionV2Service(
      new SqlSessionV2IdentityRepository(db, plane),
      new SqlSessionV2CatalogRepository(db, plane),
      decisions,
      sessionMaxTtlSeconds,
    ),
  };
}

function assertFactoryInput(
  expectedDatabaseName: string,
  evaluatorRevision: string,
): void {
  if (!expectedDatabaseName.trim()) {
    throw new Error("expected authorization database name is required");
  }
  if (!evaluatorRevision.trim()) {
    throw new Error("authorization evaluator revision is required");
  }
}
