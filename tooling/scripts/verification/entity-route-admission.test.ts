import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveShellNavigation, canAccessRoute, type ShellExperienceInput, type PlaneRouteDefinition } from "../../../packages/platform/shell/shell/src/core.js";
const registry: PlaneRouteDefinition[] = [{ id: "reference", moduleCode: "reference", href: "/platform/reference", label: "Reference", iconKey: "info", navigation: "primary", requiredPermissions: [], requiredFeatures: [] }];
const experience: ShellExperienceInput = { workspaces: [{ code: "platform", name: "Platform", sortOrder: 1, modules: [{ code: "reference", name: "Reference", sortOrder: 1, primary: true }] }],
  permissions: ["example.view"], features: {}, entityRoutes: [{ entityCode: "example_dictionary", releaseId: "release", operation: "list", permissionCode: "example.view", moduleCode: "reference", workspaceCode: "platform" }] };
test("admits only declared read shapes, never arbitrary entity prefixes", () => {
  const navigation = deriveShellNavigation(registry, experience);
  for (const path of ["/app/entity/example_dictionary", "/app/entity/example_dictionary/manage"]) assert.equal(canAccessRoute(navigation,path),true);
  for (const path of ["/app/entity/unknown", "/app/entity/example_dictionary/new", "/app/entity/example_dictionary/manage/delete", "/app/entity/example_dictionary/../../admin", "/app/entity/example_dictionary/00000000-0000-4000-8000-000000000001"]) assert.equal(canAccessRoute(navigation,path),false);
  const detail = deriveShellNavigation(registry,{...experience,entityRoutes:experience.entityRoutes!.map(r=>({...r,operation:"read"}))});
  assert.equal(canAccessRoute(detail,"/app/entity/example_dictionary/00000000-0000-4000-8000-000000000001"),true);
  assert.equal(canAccessRoute(detail,"/app/entity/example_dictionary/manage"),false);
});
test("keeps permission, module entitlement and feature gates, and legacy defaults", () => {
  for (const input of [{...experience,permissions:[]},{...experience,workspaces:[]},{...experience,entityRoutes:undefined}])
    assert.equal(canAccessRoute(deriveShellNavigation(registry,input),"/app/entity/example_dictionary"),false);
  assert.equal(canAccessRoute(deriveShellNavigation(registry.map(r=>({...r,requiredFeatures:["disabled"]})),experience),"/app/entity/example_dictionary"),false);
  assert.equal(canAccessRoute(deriveShellNavigation(registry,experience),"/platform/reference"),true);
});
test("server-admitted hidden infrastructure needs its exact known catalog binding",()=>{
  const hiddenRegistry = registry.map(r=>({...r,presentation:{workspaceCode:"platform",workspaceName:"Platform",moduleName:"Reference"}}));
  const hidden={...experience,workspaces:[],entityRoutes:experience.entityRoutes!.map(r=>({...r,sharedInfrastructure:true}))};
  assert.equal(canAccessRoute(deriveShellNavigation(hiddenRegistry,hidden),"/app/entity/example_dictionary/manage"),true);
  assert.equal(canAccessRoute(deriveShellNavigation(hiddenRegistry,{...hidden,permissions:[]}),"/app/entity/example_dictionary"),false);
  assert.equal(canAccessRoute(deriveShellNavigation(hiddenRegistry.map(r=>({...r,requiredFeatures:["disabled"]})),hidden),"/app/entity/example_dictionary"),false);
  assert.equal(canAccessRoute(deriveShellNavigation([],hidden),"/app/entity/example_dictionary"),false);
});
