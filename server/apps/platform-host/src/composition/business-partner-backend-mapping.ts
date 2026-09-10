import { businessPartnerPermissionTransitions } from "./business-partner-permission-transitions.js";
import type { AuthorizationRequest } from "@athyper/server-contract-auth";
import {
  entityScopeResolvers,
  type EntityAuthorizationProfileV1,
} from "@athyper/server-contract-metadata";
import type { EntityBackendTarget } from "@athyper/server-service-records";

const string = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 && v.length <= 160 ? v : undefined;
/** Service resource coordinates only. Advisory observations and HTTP paths are
 * deliberately excluded: neither may repair a missing enforcement coordinate. */
export function createBusinessPartnerBackendMapping(
  profile: EntityAuthorizationProfileV1,
) {
  if (profile.entityCode !== "business_partner" || profile.planeKey !== "neon")
    throw new Error("BP backend mapping requires the NEON BP profile");
  const permissionTransitions = businessPartnerPermissionTransitions(profile);
  return {
    permissionTransitions,
    owns(request: AuthorizationRequest) {
      const r = request.resource ?? {};
      return (
        request.context.planeKey === "neon" &&
        (request.permissionCode.startsWith(
          "neon.relationship.business_partner",
        ) ||
          request.permissionCode.startsWith("neon.relationship.entity_case.") ||
          request.permissionCode.startsWith("neon.relationship.bp_target.") ||
          r["entityCode"] === "business_partner" ||
          r["ownerEntityCode"] === "business_partner" ||
          Boolean(r["businessPartnerId"]))
      );
    },
    target(request: AuthorizationRequest): EntityBackendTarget | null {
      const r = request.resource ?? {},
        recordId =
          string(r["businessPartnerId"]) ??
          (r["entityCode"] === "business_partner" ||
          r["ownerEntityCode"] === "business_partner"
            ? string(r["recordId"])
            : undefined);
      let key = string(r["actionCode"]) ?? string(r["operationKey"]);
      if (key === "patch") key = "update";
      if (
        request.permissionCode === "neon.relationship.business_partner.read"
      ) {
        const companySection =
          r["sectionCode"] === "supplier-company" ||
          r["sectionCode"] === "customer-company"
            ? r["sectionCode"]
            : r["companyCodeId"] &&
                r["operatingOrganizationId"] &&
                (r["roleLens"] === "supplier" || r["roleLens"] === "customer")
              ? r["roleLens"] + "-company"
              : undefined;
        if (companySection)
          key =
            companySection === "supplier-company"
              ? "supplier_company_read"
              : "customer_company_read";
        else if (!key || key === "read") key = recordId ? "read" : "discover";
      }
      if (
        request.permissionCode.startsWith("neon.relationship.entity_case.") &&
        !r["actionCode"] &&
        !r["operationKey"]
      )
        key =
          r["sectionCode"] && request.permissionCode.endsWith(".read")
            ? "requests_read"
            : "case_" + request.permissionCode.split(".").at(-1);
      if (request.permissionCode === "neon.supplier.qualification.admin" && !key)
        key = r["companyCodeId"] ? "qualification_company" : "qualification";
      // Deferrals have no executable permission binding, but must reach the shared
      // unavailable decision instead of being remapped through field/read hints.
      if (key && profile.deferredOperations?.includes(key))
        return { operationKey: key, ...(recordId ? { recordId } : {}), phase: "execute" };
      const field = string(r["field"]);
      if (field) {
        key = profile.fieldPolicies.find((p) =>
          p.fields.includes(field),
        )?.readOperation;
        if (
          !recordId &&
          key === profile.recordReadOperation &&
          profile.ownership === "tenant.record.v1" &&
          profile.directory.population === "tenant"
        )
          key = profile.directory.operation;
      }
      let operations = profile.operations.filter(
        (o) => o.permissionCode === request.permissionCode || permissionTransitions.some(
          t => t.operationKey === o.key && t.sourcePermissionCode === request.permissionCode &&
            t.targetPermissionCode === o.permissionCode),
      );
      if (key) operations = operations.filter((o) => o.key === key);
      if (operations.length !== 1) return null;
      const operation = operations[0]!,
        coordinates: Record<string, string> = {};
      for (const coordinate of entityScopeResolvers[operation.scope]) {
        const value = string(r[coordinate]);
        if (value) coordinates[coordinate] = value;
      }
      const rawUses = r["authorizationFieldUses"],
        rawWrites = r["authorizationWriteFields"];
      if (
        rawUses !== undefined &&
        (!Array.isArray(rawUses) ||
          rawUses.some(
            (v) =>
              !v ||
              typeof v !== "object" ||
              !string(v.field) ||
              !["read", "filter", "sort", "group", "search", "export"].includes(
                v.use,
              ),
          ))
      )
        return null;
      if (
        rawWrites !== undefined &&
        (!Array.isArray(rawWrites) || rawWrites.some((v) => !string(v)))
      )
        return null;
      return {
        operationKey: operation.key,
        ...(recordId ? { recordId } : {}),
        coordinates,
        phase:
          r["actionCode"] || (r["sectionCode"] && operation.effect !== "read")
            ? "discover"
            : "execute",
        historical: r["historical"] === true,
        ...(field ? { fieldUses: [{ field, use: "read" as const }] } : {}),
        ...(rawUses
          ? {
              fieldUses: rawUses as NonNullable<
                EntityBackendTarget["fieldUses"]
              >,
            }
          : {}),
        ...(rawWrites ? { writeFields: rawWrites as string[] } : {}),
      };
    },
  };
}
