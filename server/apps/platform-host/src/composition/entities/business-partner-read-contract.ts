import type { BusinessPartner360Query } from "@athyper/server-contract-master-data";
import { MasterDataError } from "@athyper/server-service-master-data";
import { EntityRuntimeResourceError } from "@athyper/server-platform-experience";

export function rethrowBusinessPartnerReadError(error: unknown): never {
  if (error instanceof MasterDataError) {
    if (error.code === "BP_360_SCOPE_INVALID" || error.code === "BP_360_SCOPE_REQUIRED")
      throw new EntityRuntimeResourceError(409, "ENTITY_RUNTIME_CONTEXT_REQUIRED", "Select an authorized organization and company context for this section.");
    if (error.status === 403 || error.status === 404)
      throw new EntityRuntimeResourceError(error.status, "ENTITY_RUNTIME_RECORD_UNAVAILABLE", "Record unavailable");
    if (error.status === 400 || error.status === 409)
      throw new EntityRuntimeResourceError(error.status, "ENTITY_RUNTIME_RESOURCE_INVALID", "Invalid section request");
  }
  throw error;
}

type Scope = Pick<BusinessPartner360Query, "operatingOrganizationId" | "companyCodeId" | "legalEntityId" | "roleLens" | "asOf">;
/** Only the supported scope coordinates cross the domain adapter boundary. */
export function businessPartnerReadScope(input?: Omit<Scope, "roleLens"> & {readonly roleLens?: string}): Scope {
  const roleLens = input?.roleLens;
  if (roleLens !== undefined && roleLens !== "all" && roleLens !== "supplier" && roleLens !== "customer")
    throw new EntityRuntimeResourceError(400, "ENTITY_RUNTIME_RESOURCE_INVALID", "Unsupported Business Partner role lens");
  return {
    ...(input?.operatingOrganizationId ? { operatingOrganizationId: input.operatingOrganizationId } : {}),
    ...(input?.companyCodeId ? { companyCodeId: input.companyCodeId } : {}),
    ...(input?.legalEntityId ? { legalEntityId: input.legalEntityId } : {}),
    ...(roleLens ? { roleLens } : {}),
    ...(input?.asOf ? { asOf: input.asOf } : {}),
  };
}

export function collectionResource<T extends Record<string, unknown>>(
  revision: string, data: T, nextCursor?: string,
) {
  return { revision, data: { ...data, ...(nextCursor ? { nextCursor } : {}) } };
}
