import type { AuthorizationRequest } from "@athyper/server-contract-auth";
import type { EntityAuthorizationProfileV1 } from "@athyper/server-contract-metadata";
import type { EntityBackendTarget } from "@athyper/server-service-records";

/** Independent child authority. Parent BP coordinates never supply case ownership. */
export function createEntityCaseBackendMapping(
  profile: EntityAuthorizationProfileV1,
) {
  if (profile.entityCode !== "entity_case" || profile.planeKey !== "neon")
    throw Error("Independent NEON case profile required");
  return {
    owns: (request: AuthorizationRequest) =>
      request.context.planeKey === "neon" &&
      request.resource?.["entityCode"] === "entity_case",
    target(request: AuthorizationRequest): EntityBackendTarget | null {
      const resource = request.resource ?? {},
        id = resource["recordId"],
        key =
          resource["authorizationTarget"] === "proposed" && id
            ? "reassign"
            : (resource["operationKey"] ??
              request.permissionCode.split(".").at(-1));
      const operation = profile.operations.find(
        (item) =>
          item.key === key && item.permissionCode === request.permissionCode,
      );
      if (
        !operation ||
        (operation.target === "existing" && typeof id !== "string")
      )
        return null;
      const coordinates: Record<string, string> = {};
      for (const name of ["operatingOrganizationId", "companyCodeId"])
        if (typeof resource[name] === "string")
          coordinates[name] = resource[name];
      return {
        operationKey: operation.key,
        ...(typeof id === "string" ? { recordId: id } : {}),
        coordinates,
        phase: "execute",
      };
    },
  };
}
