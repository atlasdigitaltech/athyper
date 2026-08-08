import { createHash } from "node:crypto";
import {
  AtlasDataGateway,
  type AtlasDataGatewayDependencies,
  type AtlasDataReadRequest,
  type AtlasLoadedData,
} from "@athyper/svc-ai";
import type { VerifiedRequestContext } from "@athyper/svc-iam";
import type { ExecutionDescriptorProvider } from "@athyper/svc-metadata";
import type { EntityQueryService } from "@athyper/svc-records";

const CERTIFIED_ENTITY = "company_code";
const ENTITY_PERMISSION = "read";
const MAX_MASKED_RECORD_BYTES = 32_768;
const MAX_MASKED_RECORD_FIELDS = 64;

export interface AtlasCompanyCodeGatewayOptions {
  readonly descriptors: Pick<ExecutionDescriptorProvider, "get">;
  readonly query: Pick<EntityQueryService, "detail">;
}

/**
 * First production-shaped Atlas record bridge. It deliberately certifies one
 * reference entity only and delegates SQL planning, tenant predicates,
 * company/legal-entity scope, and descriptor field masking to Query V1.
 */
export function createAtlasCompanyCodeDataGateway(
  options: AtlasCompanyCodeGatewayOptions,
): AtlasDataGateway {
  const dependencies: AtlasDataGatewayDependencies = {
    authorize: async (context, request) =>
      authorizeCompanyCodeRead(context, request),
    load: async (context, request) =>
      loadCompanyCode(options, context, request),
    mask: async (_context, _request, loaded) => {
      if (!isBoundedRecord(loaded.value)) {
        return { ok: false, code: "MASKED_RECORD_OUT_OF_BOUNDS" };
      }
      // EntityQueryService.detail has already applied the activated
      // descriptor's hidden/redacted field policy.
      return { ok: true, value: loaded.value };
    },
  };
  return new AtlasDataGateway(dependencies);
}

function authorizeCompanyCodeRead(
  context: VerifiedRequestContext,
  request: AtlasDataReadRequest,
) {
  if (
    context.planeKey !== "neon"
    || request.sourceKind !== "record"
    || request.entityCode !== CERTIFIED_ENTITY
    || request.permissionCode !== ENTITY_PERMISSION
  ) {
    return { allowed: false as const, code: "ENTITY_NOT_CERTIFIED" };
  }
  const scope = context.permissions.authorizationScopes.get(
    ENTITY_PERMISSION,
  );
  if (!scope) {
    return { allowed: false as const, code: "READ_SCOPE_MISSING" };
  }
  if (scope.tenantWide) return { allowed: true as const };
  // Reference master data has no owner/team axis. Scoped access must therefore
  // be an explicit active company/legal-entity/organization intersection.
  if (
    context.companyCodeId
    && scope.companyCodeIds.has(context.companyCodeId)
  ) {
    return { allowed: true as const };
  }
  if (
    context.legalEntityId
    && scope.legalEntityIds.has(context.legalEntityId)
  ) {
    return { allowed: true as const };
  }
  if (
    context.organizationId
    && scope.operatingOrganizationIds.has(context.organizationId)
  ) {
    return { allowed: true as const };
  }
  return { allowed: false as const, code: "ROW_SCOPE_DENIED" };
}

async function loadCompanyCode(
  options: AtlasCompanyCodeGatewayOptions,
  context: VerifiedRequestContext,
  request: AtlasDataReadRequest,
): Promise<AtlasLoadedData | null> {
  if (request.entityCode !== CERTIFIED_ENTITY) return null;
  const resolved = await options.descriptors.get({
    plane: context.planeKey,
    tenantId: context.tenantId,
    entityCode: CERTIFIED_ENTITY,
  }, new Map());
  if (
    resolved.descriptor.identity.entityCode !== CERTIFIED_ENTITY
  ) {
    return null;
  }
  const result = await options.query.detail({
    context,
    descriptor: resolved.descriptor,
    generation: resolved.generation,
    id: request.sourceId,
    hydrateReferences: false,
  });
  if (!result.data) return null;
  const canonical = canonicalJson(result.data);
  const digest = createHash("sha256").update(canonical).digest("hex");
  return Object.freeze({
    value: Object.freeze({ ...result.data }),
    source: Object.freeze({
      sourceKind: "record" as const,
      sourceId: request.sourceId,
      sourceVersionId: `sha256-${digest}`,
      sourceChecksum: `sha256:${digest}`,
    }),
  });
}

function isBoundedRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).length > MAX_MASKED_RECORD_FIELDS) return false;
  try {
    return Buffer.byteLength(canonicalJson(value), "utf8")
      <= MAX_MASKED_RECORD_BYTES;
  } catch {
    return false;
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}
