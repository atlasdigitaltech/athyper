import express from "express";
import { it, expect, vi } from "vitest";
import { routeContracts } from "@athyper/server-runtime-http";
import { registerControlServiceRoutes } from "./control-service-routes.js";
import { registerRuntimeCommandRoutes } from "./runtime-command-routes.js";
import { registerAuthorizationManagementRoutes } from "./authorization-management-routes.js";
import { registerCycleConfigRoutes } from "./cycle/cycle-config-routes.js";
it("registers all 44 planned operations with authentication and permissions when explicitly enabled", () => {
  const app = express(),
    common = {
      authenticate: vi.fn() as never,
      readContext: vi.fn() as never,
      service: {} as never,
    };
  registerControlServiceRoutes(app, {
    ...common,
    services: {} as never,
    flags: {
      tenantOverrides: true,
      lookupAndRoundingConfiguration: true,
      connectorLifecycle: true,
      localCatalogReads: true,
      catalogAuthoring: true,
    },
  });
  registerAuthorizationManagementRoutes(app, common);
  registerCycleConfigRoutes(app, common);
  registerRuntimeCommandRoutes(app, common);
  const routes = routeContracts(app);
  expect(routes).toHaveLength(44);
  expect(new Set(routes.map((r) => r.method + ":" + r.path)).size).toBe(44);
  for (const r of routes) {
    expect(r.authenticated).toBe(true);
    expect(r.permission).toBeTruthy();
    expect(r.path).toMatch(/^\/api\/control-admin\//);
  }
});
