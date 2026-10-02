import type { AtlasBusinessContextV1 } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { RecordListScopeCoordinate } from "@athyper/server-contract-records";
import { AtlasServiceError } from "./errors.js";

export const atlasRecordScopeSchema = {
  type: "object", additionalProperties: false,
  properties: {
    operatingOrganizationId: { type: "string", format: "uuid" },
    companyCodeId: { type: "string", format: "uuid" },
    legalEntityId: { type: "string", format: "uuid" },
    networkAccountId: { type: "string", format: "uuid" },
    parentEntityCode: { type: "string", pattern: "^[a-z][a-z0-9_]{1,62}$" },
    parentRecordId: { type: "string", format: "uuid" },
    relationshipKey: { type: "string", pattern: "^[a-z][a-z0-9_]{1,62}$" },
    parentDescriptorHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
  },
};

/** A publication-bound selector for the existing entity.parent.v1 Records
 * resolver. Records derives the actual predicates after current parent access. */
export async function resolveAtlasParentScope(
  metadata: MetadataReader,
  context: VerifiedRequestContext,
  page: AtlasBusinessContextV1,
): Promise<RecordListScopeCoordinate | undefined> {
  if (!page.parentScope) return page.workContext;
  const parent = await metadata.getEntityDescriptor(context, page.parentScope.parentEntityCode);
  const relation = parent?.recordPresentation?.entityRelationships?.find(item =>
    item.key === page.parentScope!.relationshipKey && item.targetEntity === page.entityCode);
  if (!parent || parent.entityCode !== page.parentScope.parentEntityCode ||
      parent.planeKey !== context.planeKey || !parent.compiledHash || !relation)
    throw new AtlasServiceError("BUSINESS_CONTEXT_UNAVAILABLE", "The requested parent scope is unavailable.");
  return Object.freeze({ ...page.workContext, ...page.parentScope, parentDescriptorHash: parent.compiledHash });
}

/** Internal tool coordinates are never part of the model's scope selection. */
export function validateAtlasRecordScope(value: unknown): asserts value is RecordListScopeCoordinate {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const item = value as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const code = /^[a-z][a-z0-9_]{1,62}$/;
  const patterns: Record<string, RegExp> = {
    operatingOrganizationId: uuid, companyCodeId: uuid, legalEntityId: uuid, networkAccountId: uuid,
    parentEntityCode: code, parentRecordId: uuid, relationshipKey: code,
    parentDescriptorHash: /^[a-f0-9]{64}$/,
  };
  if (Object.entries(item).some(([key, value]) => typeof value !== "string" || !patterns[key]?.test(value))) invalid();
  if (["parentEntityCode", "parentRecordId", "relationshipKey", "parentDescriptorHash"].some(key => Object.hasOwn(item, key)) &&
      ["parentEntityCode", "parentRecordId", "relationshipKey", "parentDescriptorHash"].some(key => !Object.hasOwn(item, key))) invalid();
}
function invalid(): never {
  throw new AtlasServiceError("TOOL_INVALID", "Invalid record scope coordinates.");
}
