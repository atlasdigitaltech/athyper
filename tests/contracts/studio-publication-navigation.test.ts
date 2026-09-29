import assert from "node:assert/strict";
import { test } from "node:test";
import { studioRoutes } from "../../packages/planes/studio/shell/src/navigation.js";
import {
  canAccessRoute,
  deriveShellNavigation,
} from "../../packages/platform/shell/shell/src/core.js";

const path = "/entity/publishing";
function navigation(permissions: string[], entitled = true) {
  return deriveShellNavigation(studioRoutes, {
    workspaces: entitled
      ? [
          {
            code: "entity",
            name: "Entity Studio",
            sortOrder: 1,
            modules: [
              { code: "pub", name: "Publication", sortOrder: 1, primary: true },
            ],
          },
        ]
      : [],
    permissions,
    features: {},
  });
}
test("the publication workspace is available through the entitled publishing module", () => {
  const nav = navigation([]);
  assert.equal(canAccessRoute(nav, path), true);
  assert.equal(
    nav.routes.find((route) => route.href === path)?.moduleCode,
    "pub",
  );
});
test("Atlas learning requires the published review permission", () => {
  assert.equal(canAccessRoute(navigation([]), "/atlas/learning"), false);
  assert.equal(
    canAccessRoute(navigation(["metadata.entity.review"]), "/atlas/learning"),
    true,
  );
});
test("publication navigation preserves the module entitlement gate", () => {
  assert.equal(canAccessRoute(navigation([], false), path), false);
});
