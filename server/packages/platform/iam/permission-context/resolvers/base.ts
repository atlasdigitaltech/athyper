import { createHash } from "node:crypto";

import type { CanonicalDecisionRequest } from "../../authorization-evaluator/index.js";
import type {
  ProductionAuthorizationDecisionApi,
} from "../../authorization-runtime/types.js";
import type {
  SessionV2CatalogRepository,
} from "../../authorization-runtime/session-v2.js";
import type {
  EffectiveAuthorizationScope,
  EffectivePermissionContext,
  EffectivePermissionEntry,
  PermissionResolver,
  PlaneKey,
  ResolverInput,
} from "../types.js";

export interface CanonicalResolverDeps {
  readonly decisions: ProductionAuthorizationDecisionApi;
  readonly catalog: SessionV2CatalogRepository;
}

export function computeProfileHash(args: {
  principalFingerprint: string;
  allowedCodes: ReadonlySet<string>;
  planVersionId?: string;
}): string {
  return createHash("sha256").update(JSON.stringify({
    principalFingerprint: args.principalFingerprint,
    allowedCodes: [...args.allowedCodes].sort(),
    planVersionId: args.planVersionId ?? "na",
  })).digest("hex");
}

export function computeSchemaHash(): string {
  return createHash("sha256").update(JSON.stringify({
    nodeEnv: process.env["NODE_ENV"] ?? "unknown",
    featureFlags: process.env["ATHYPER_FEATURE_FLAGS"] ?? "",
    runtimeContractsVersion:
      process.env["ATHYPER_RUNTIME_CONTRACTS_VERSION"] ?? "0",
    compilerVersion: process.env["ATHYPER_COMPILER_VERSION"] ?? "0",
  })).digest("hex").slice(0, 12);
}

export function createCanonicalResolver(
  planeKey: PlaneKey,
  deps: CanonicalResolverDeps,
): PermissionResolver {
  return {
    planeKey,
    async build(input: ResolverInput): Promise<EffectivePermissionContext> {
      if (input.planeKey !== planeKey) {
        throw new Error(
          `permission resolver plane mismatch: expected ${planeKey}, received ${input.planeKey}`,
        );
      }

      const evaluatedAt = new Date();
      const catalog = await deps.catalog.load({
        plane: planeKey,
        tenantOrAccountId: input.tenantId,
        evaluatedAt,
      });
      const requests: CanonicalDecisionRequest[] = catalog.entries.map(
        (entry, index) => entry.entityOperationId
          ? {
              requestId: `permission-context:${planeKey}:${index}:${entry.entityOperationId}`,
              mode: "collection",
              subject: {
                plane: planeKey,
                tenantOrAccountId: input.tenantId,
                principalId: input.principalId,
              },
              entityOperationId: entry.entityOperationId,
              evaluatedAt,
              assurance: { mfaSatisfied: false, sodSatisfied: false },
            }
          : {
              requestId: `permission-context:${planeKey}:${index}:${entry.permissionId}`,
              mode: "registered_capability",
              subject: {
                plane: planeKey,
                tenantOrAccountId: input.tenantId,
                principalId: input.principalId,
              },
              permissionId: entry.permissionId,
              evaluatedAt,
              assurance: { mfaSatisfied: false, sodSatisfied: false },
            },
      );
      const batch = await deps.decisions.decideBatch(requests);
      if (batch.results.length !== catalog.entries.length) {
        throw new Error("canonical permission-context decision batch is incomplete");
      }

      const allowed = new Set<string>();
      const denied = new Set<string>();
      const planLocked = new Set<string>();
      const entries = new Map<string, EffectivePermissionEntry>();
      const authorizationScopes =
        new Map<string, EffectiveAuthorizationScope>();

      for (let index = 0; index < batch.results.length; index += 1) {
        const envelope = batch.results[index]!;
        const catalogEntry = catalog.entries[index]!;
        const organizationalAllow = envelope.result.mode !== "collection"
          || envelope.result.materialization.organizationalAllowClauses.length > 0;
        const legacyScopeCanRepresentDecision =
          envelope.result.mode !== "collection"
          || envelope.result.materialization.denyScopes.length === 0;
        const isAllowed =
          envelope.result.decision === "allow"
          && organizationalAllow
          && legacyScopeCanRepresentDecision;
        if (isAllowed) allowed.add(catalogEntry.canonicalCode);
        else if (envelope.result.reason === "entitlement_unavailable") {
          planLocked.add(catalogEntry.canonicalCode);
        } else {
          denied.add(catalogEntry.canonicalCode);
        }
        entries.set(catalogEntry.canonicalCode, {
          code: catalogEntry.canonicalCode,
          status: isAllowed
            ? "allow"
            : envelope.result.reason === "entitlement_unavailable"
            ? "not_in_plan"
            : "deny",
          reason: isAllowed
            ? "allowed"
            : envelope.result.reason === "entitlement_unavailable"
            ? "plan_locked"
            : "denied_by_grant",
        });
        if (envelope.result.mode === "collection") {
          const constraints = envelope.result.materialization
            .organizationalAllowClauses.flatMap((clause) => clause.intersection);
          const dimensionValues = (
            dimension:
              | "legal_entity"
              | "company_code"
              | "operating_organization"
              | "network_relationship",
          ): ReadonlySet<string> => new Set(
            constraints.flatMap((constraint) =>
              constraint.dimensions[dimension] ?? []
            ),
          );
          authorizationScopes.set(catalogEntry.canonicalCode, {
            permissionCode: catalogEntry.canonicalCode,
            tenantWide: legacyScopeCanRepresentDecision
              && envelope.result.materialization.organizationalAllowClauses
                .some((clause) =>
                  clause.intersection.every((constraint) => constraint.tenantWide)
                ),
            legalEntityIds: legacyScopeCanRepresentDecision
              ? dimensionValues("legal_entity")
              : new Set(),
            companyCodeIds: legacyScopeCanRepresentDecision
              ? dimensionValues("company_code")
              : new Set(),
            operatingOrganizationIds: legacyScopeCanRepresentDecision
              ? dimensionValues("operating_organization")
              : new Set(),
            networkMembershipIds: legacyScopeCanRepresentDecision
              ? dimensionValues("network_relationship")
              : new Set(),
            visibility: legacyScopeCanRepresentDecision ? "all" : "own",
          });
        }
      }

      const principalFingerprint = createHash("sha256").update(JSON.stringify({
        principalId: input.principalId,
        tenantOrAccountId: input.tenantId,
        plane: planeKey,
        catalogVersion: catalog.catalogVersion,
        decisionFingerprints: batch.results
          .map((result) => result.authorizationFingerprint)
          .sort(),
      })).digest("hex");

      return {
        planeKey,
        tenantId: input.tenantId,
        principalId: input.principalId,
        principalFingerprint,
        allowed,
        denied,
        planLocked,
        planeExcluded: new Set(),
        entries,
        authorizationScopes,
        profileHash: computeProfileHash({
          principalFingerprint,
          allowedCodes: allowed,
        }),
        schemaHash: input.schemaHash ?? computeSchemaHash(),
        resolvedAt: evaluatedAt.getTime(),
      };
    },
  };
}
