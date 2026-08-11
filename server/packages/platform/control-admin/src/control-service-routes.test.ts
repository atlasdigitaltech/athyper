import { describe, expect, it, vi } from "vitest";
import { assertControlServiceRoutePlaneSafety, disabledControlServiceRouteFlags, registerControlServiceRoutes } from "./control-service-routes.js";

describe("control service route composition", () => {
  it("registers no route when every capability flag is disabled", () => {
    expect(collect(disabledControlServiceRouteFlags)).toEqual([]);
  });

  it("keeps local catalog reads separate from mutation surfaces", () => {
    const routes = collect({ ...disabledControlServiceRouteFlags, localCatalogReads: true });
    expect(routes).toContain("GET /api/control-admin/features");
    expect(routes).toContain("POST /api/control-admin/bank-validation/verify");
    expect(routes.some((entry) => entry.includes("override"))).toBe(false);
    expect(routes.some((entry) => entry.includes("/publish"))).toBe(false);
    expect(routes.some((entry) => entry.includes("/connectors/"))).toBe(false);
  });

  it("registers tenant overrides without catalog authoring or finance writers", () => {
    const routes = collect({ ...disabledControlServiceRouteFlags, tenantOverrides: true });
    expect(routes).toEqual(expect.arrayContaining([
      "PUT /api/control-admin/features/:code/override",
      "PUT /api/control-admin/parameters/:code/value",
      "PUT /api/control-admin/entitlements/overrides/:id",
    ]));
    expect(routes.some((entry) => entry.includes("rounding"))).toBe(false);
    expect(routes.some((entry) => entry.includes("/publish"))).toBe(false);
  });

  it("fails startup declarations that put privileged writers on the wrong plane", () => {
    expect(() => assertControlServiceRoutePlaneSafety({ catalogAuthoringPlanes: ["neon"], financeWriterPlanes: [] })).toThrowError(expect.objectContaining({ code: "CONTROL_ADMIN_CATALOG_AUTHORING_STUDIO_REQUIRED" }));
    expect(() => assertControlServiceRoutePlaneSafety({ catalogAuthoringPlanes: [], financeWriterPlanes: ["studio", "mesh"] })).toThrowError(expect.objectContaining({ code: "CONTROL_ADMIN_FINANCE_WRITER_NEON_REQUIRED" }));
  });
});

function collect(flags: Parameters<typeof registerControlServiceRoutes>[1]["flags"]): string[] {
  const routes: string[] = [];
  const application = {
    get: vi.fn((path: string) => { routes.push(`GET ${path}`); }),
    put: vi.fn((path: string) => { routes.push(`PUT ${path}`); }),
    post: vi.fn((path: string) => { routes.push(`POST ${path}`); }),
  };
  registerControlServiceRoutes(application as never, { authenticate: vi.fn() as never, readContext: vi.fn() as never, services: {} as never, flags });
  return routes;
}
