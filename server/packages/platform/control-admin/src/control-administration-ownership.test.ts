import { describe, expect, it } from "vitest";
import {
  assertApprovedControlAdministrationRoute,
  controlAdministrationOwnership,
  controlAdministrationOwnershipDecision,
} from "./control-administration-ownership.js";

describe("C1 control-administration ownership", () => {
  it("approves one unique classification for every governed resource and table", () => {
    expect(controlAdministrationOwnershipDecision.status).toBe("approved");
    const resources = controlAdministrationOwnershipDecision.entries.map((entry) => entry.resource);
    const tables = controlAdministrationOwnershipDecision.entries.flatMap((entry) => entry.tables);
    expect(new Set(resources).size).toBe(resources.length);
    expect(new Set(tables).size).toBe(tables.length);
  });

  it("keeps platform catalogs read-only at runtime", () => {
    expect(controlAdministrationOwnership("feature_definitions")).toMatchObject({ classification: "platform_catalog", writeMechanism: "versioned_publication", runtimeWrite: "none" });
    expect(() => assertApprovedControlAdministrationRoute({ resource: "feature_definitions", operation: "write" })).toThrowError(expect.objectContaining({ code: "CONTROL_ADMIN_PLATFORM_CATALOG_WRITE_ROUTE_FORBIDDEN" }));
    expect(assertApprovedControlAdministrationRoute({ resource: "feature_definitions", operation: "read" }).runtimeRead).toBe(true);
  });

  it("requires exact tenant scope for override and aggregate write routes", () => {
    expect(() => assertApprovedControlAdministrationRoute({ resource: "feature_overrides", operation: "write" })).toThrowError(expect.objectContaining({ code: "CONTROL_ADMIN_TENANT_SCOPE_REQUIRED" }));
    expect(assertApprovedControlAdministrationRoute({ resource: "feature_overrides", operation: "write", tenantScoped: true }).safeguards).toEqual(expect.arrayContaining(["occ", "audit", "outbox", "invalidation"]));
    expect(assertApprovedControlAdministrationRoute({ resource: "cycle_templates", operation: "write", tenantScoped: true })).toMatchObject({ classification: "tenant_configuration", runtimeWrite: "aggregate" });
  });

  it("rejects generic lookup CRUD and requires row ownership resolution", () => {
    expect(() => assertApprovedControlAdministrationRoute({ resource: "reference_lookups", operation: "write", tenantScoped: true })).toThrowError(expect.objectContaining({ code: "CONTROL_ADMIN_GENERIC_REFERENCE_WRITE_ROUTE_FORBIDDEN" }));
    expect(assertApprovedControlAdministrationRoute({ resource: "reference_lookups", operation: "write", tenantScoped: true, rowOwnershipResolved: true }).ownershipRule).toContain("extensible domain");
    expect(controlAdministrationOwnershipDecision.genericCrudAllowed).toBe(false);
  });

  it("allows reviewed platform catalog authoring only in Studio", () => {
    expect(assertApprovedControlAdministrationRoute({ resource: "bank_validation_rules", operation: "author", planeKey: "studio" }).classification).toBe("platform_catalog");
    expect(() => assertApprovedControlAdministrationRoute({ resource: "bank_validation_rules", operation: "author", planeKey: "neon" })).toThrowError(expect.objectContaining({ code: "CONTROL_ADMIN_CATALOG_AUTHORING_STUDIO_REQUIRED" }));
  });
});
