import { expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { compileListExperience } from "../list-experience.js";
const surface = {
  id: "list",
  surfaceKey: "partners",
  surfaceKind: "list",
  title: "Partners",
  layoutConfig: {
    experience: {
      routes: [{ surfaceKey: "onboarding", href: "/requests/new" }],
      header: {
        title: { defaultLocale: "en", values: { en: "Partners", ms: "Rakan" } },
      },
    },
  },
};
const graph: MetaEntityGraph = {
  contractSchema: "athyper.meta-entity-contract/2.1",
  entity: { entityCode: "partner" },
  fields: [],
  operations: [
    {
      id: "operation",
      operationKey: "onboard",
      operationKind: "create",
      label: "New request",
      auditEventCode: "request.created",
      inputSurfaceKey: "onboarding",
    },
  ],
  surfaces: [
    surface,
    {
      id: "form",
      surfaceKey: "onboarding",
      surfaceKind: "form",
      title: "New request",
    },
  ],
  surfaceOperations: [
    {
      entitySurfaceId: "list",
      entityOperationId: "operation",
      placementKey: "new_request",
      interactionTarget: "primary",
      position: 0,
    },
  ],
  operationPermissions: [
    {
      entityOperationId: "operation",
      targetPlane: "neon",
      permissionKind: "entity_operation",
      permissionCode: "partner.request.create",
    },
  ],
  operationRules: [
    {
      entityOperationId: "operation",
      ruleKey: "deny_mesh",
      decision: "deny",
      planeCode: "mesh",
    },
  ],
  operationScopeBindings: [
    {
      entityOperationId: "operation",
      bindingKey: "organization",
      targetPlane: "neon",
      decisionMode: "entity_resource",
      scopeKind: "operating_organization",
      coordinateSource: "relation_resolver",
      resolverKey: "partner.organization.v1",
    },
  ],
};
it("compiles the graph joins into a localized header and bound action", () => {
  const result = compileListExperience(graph, surface);
  expect(result.header.title.values.ms).toBe("Rakan");
  expect(result.actions[0]).toMatchObject({
    operationKey: "onboard",
    targetSurfaceKey: "onboarding",
    permissions: [{ plane: "neon", permissionCode: "partner.request.create" }],
    rules: [{ key: "deny_mesh", decision: "deny", plane: "mesh" }],
    scopes: [
      {
        scopeKind: "operating_organization",
        resolverKey: "partner.organization.v1",
      },
    ],
  });
});
it("rejects missing permission links and unpublished target surfaces", () => {
  expect(() =>
    compileListExperience({ ...graph, operationPermissions: [] }, surface),
  ).toThrow();
  expect(() =>
    compileListExperience({ ...graph, surfaces: [surface] }, surface),
  ).toThrow();
});

it("validates navigation workflow membership and count registration at publication", () => {
  const list = { ...surface, layoutConfig: {experience: { ...surface.layoutConfig.experience, routes:[...surface.layoutConfig.experience.routes,{surfaceKey:"partners",href:"/partners"}], navigation: {new_request:{kind:"review",workflowKey:"review_flow",attentionCountKey:"my_reviews"}}}}};
  const configured: MetaEntityGraph = {...graph,surfaces:[list,...graph.surfaces!.slice(1)],surfaceOperations:graph.surfaceOperations!.map(binding=>({...binding,interactionTarget:"navigation"})),flows:[{id:"flow",flowKey:"review_flow",flowKind:"approval",title:"Review"}],flowSteps:[{entityFlowId:"flow",entitySurfaceId:"form",stepKey:"review",position:0}]};
  expect(()=>compileListExperience(configured,list)).toThrow(/count resolver/);
  const compiled=compileListExperience(configured,list,["my_reviews"]);
  expect(compiled.actions).toEqual([]);
  expect(compiled.navigation?.[0]?.workflowKey).toBe("review_flow");
  expect(()=>compileListExperience({...configured,flowSteps:[]},list,["my_reviews"])).toThrow(/workflow/);
  expect(()=>compileListExperience({...configured,flows:[]},list,["my_reviews"])).toThrow(/workflow/);
});
