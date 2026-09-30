import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEntityAuthorizationProfile, type EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { entityAuthorizationProfileHash } from "@athyper/server-service-records";
import { assertEntityAuthorizationEnforceable } from "../entity-authorization-activation.js";

const protectedProfile = parseEntityAuthorizationProfile(JSON.parse(readFileSync(
  new URL("../../../../../../../../packages/contracts/platform/fixtures/entity-authorization/business-partner.v1.json", import.meta.url), "utf8")));
const protectedDescriptor = { entityCode: protectedProfile.entityCode, planeKey: "neon", authorization: protectedProfile, fields: [], operations: {},
  storage: { schema: "master", object: "business_partner", idField: "id", tenantField: "tenant_id" } } as unknown as EntityRuntimeDescriptor;
const hash = entityAuthorizationProfileHash(protectedProfile);

const operations = (["list", "read"] as const).map(key => ({ key, permissionCode: "common.platform.reference.view",
  scope: "tenant.record.v1" as const, target: key === "list" ? "collection" as const : "existing" as const,
  effect: "read" as const, requiresParentRead: false, requiresPreflight: false }));
const country = (plane: "studio" | "neon" | "mesh") => ({
  entityCode: "country", planeKey: plane, referenceCapability: "common.platform.reference.view",
  storage: { schema: "shared", object: "country", idField: "id" },
  fields: [{ key: "code", storagePath: "code", type: "string", required: true, writableOn: [], classification: "public", searchable: true }],
  operations: Object.fromEntries(operations.map(operation => [operation.key, { code: operation.key, permissionCode: operation.permissionCode }])),
  authorization: { schemaVersion: 1, entityCode: "country", planeKey: plane, ownership: "tenant.record.v1",
    directory: { operation: "list", population: "tenant" }, recordReadOperation: "read", operations,
    fieldPolicies: [{ key: "public", fields: ["code"], readOperation: "read", representation: "plain", writeOperations: [], queryUses: ["search", "filter", "sort", "group"] }],
    surfaces: [], relationships: [] },
  authorizationRuntime: { schemaVersion: 1, runtimeVersion: "entity-authorization.v1",
    bindings: operations.map(operation => ({ operation: operation.key, handler: `entity.record.${operation.key}.v1`, resolver: "tenant.record.v1" })) },
}) as unknown as EntityRuntimeDescriptor;

describe("entity authorization activation", () => {
  it("rejects publishing a protected profile that no enforcing backend has installed", () => {
    expect(() => assertEntityAuthorizationEnforceable([protectedDescriptor], "neon", {})).toThrow("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
  });
  it("rejects a profile whose hash differs from the one the authorizer enforces", () => {
    const stale = { enforcedEntityProfile: () => "0".repeat(64) };
    expect(() => assertEntityAuthorizationEnforceable([protectedDescriptor], "neon", stale)).toThrow("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
  });
  it("activates a protected profile only when the enforced hash matches", () => {
    expect(() => assertEntityAuthorizationEnforceable([protectedDescriptor], "neon", { enforcedEntityProfile: () => hash })).not.toThrow();
  });
  it("refuses masked fields even when the hash matches", () => {
    const masked = { ...protectedProfile, fieldPolicies: protectedProfile.fieldPolicies.map(policy => ({ ...policy, representation: "masked" as const })) };
    const descriptor = { ...protectedDescriptor, authorization: masked };
    expect(() => assertEntityAuthorizationEnforceable([descriptor], "neon", { enforcedEntityProfile: () => entityAuthorizationProfileHash(masked) })).toThrow("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
  });
  it.each(["studio", "neon", "mesh"] as const)("requires an installed backend for Country on %s", (plane) => {
    expect(() => assertEntityAuthorizationEnforceable([country(plane)], plane, {})).toThrow("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
  });
  it("rejects a Country-shaped entity once a field is no longer public", () => {
    const widened = country("neon");
    const tampered = { ...widened, fields: widened.fields.map(field => ({ ...field, classification: "restricted" })) } as unknown as EntityRuntimeDescriptor;
    expect(() => assertEntityAuthorizationEnforceable([tampered], "neon", {})).toThrow("ENTITY_BACKEND_AUTHORIZATION_UNAVAILABLE");
  });
});
