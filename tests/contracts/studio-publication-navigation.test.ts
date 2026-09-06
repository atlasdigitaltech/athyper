import assert from "node:assert/strict";
import { test } from "node:test";
import { studioRoutes } from "../../packages/planes/studio/shell/src/navigation.js";
import { canAccessRoute, deriveShellNavigation } from "../../packages/platform/shell/shell/src/core.js";

const path = "/mdg/business-partner/publication";
function navigation(permissions: string[], entitled = true) {
  return deriveShellNavigation(studioRoutes, {
    workspaces: entitled ? [{code: "entity", name: "Entity Studio", sortOrder: 1,
      modules: [{code: "pub", name: "Publication", sortOrder: 1, primary: true}]}] : [],
    permissions,
    features: {},
  });
}
test("the publication workspace is available to both separated actors", () => {
  for (const permission of ["author", "publish"]) {
    const nav = navigation(["studio.business_partner_definition.read", `studio.business_partner_definition.${permission}`]);
    assert.equal(canAccessRoute(nav, path), true);
    assert.equal(nav.routes.find(route => route.href === path)?.moduleCode, "pub");
    assert.equal(canAccessRoute(nav, "/mdg/business-partner/workflows"), false);
  }
});
test("publication navigation requires definition read permission", () => {
  assert.equal(canAccessRoute(navigation([]), path), false);
});
test("publication navigation preserves the module entitlement gate", () => {
  assert.equal(canAccessRoute(navigation(["studio.business_partner_definition.read"], false), path), false);
});
