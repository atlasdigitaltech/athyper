import { describe, expect, it, vi } from "vitest";
import {
  parseEntityListDescriptor,
  parsePublishedListExperience,
  resolveEntityText,
} from "@athyper/contract-platform-entity-list";
import type {
  VerifiedRequestContext,
  Authorizer,
} from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordCollectionScopeResolution } from "@athyper/server-contract-records";
import { compileEntityListDescriptor } from "../entity-list-service.js";
import { effectiveListActions } from "../list-experience.js";
const text = {
  defaultLocale: "en",
  values: { en: "Start request", ms: "Mulakan permohonan" },
};
const experience = parsePublishedListExperience({
  schemaVersion: 1,
  header: { title: text },
  routes: [{ surfaceKey: "request_form", href: "/requests/new" }],
  actions: [
    {
      key: "request",
      label: text,
      operationKey: "request_create",
      targetSurfaceKey: "request_form",
      placement: "primary",
      position: 0,
      permissions: [{ plane: "neon", permissionCode: "request.create" }],
      rules: [],
      scopes: [],
      requiresPreflight: false,
    },
  ],
});
const descriptor: EntityRuntimeDescriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "partner",
  planeKey: "neon",
  releaseId: "r1",
  releaseNo: 1,
  contractHash: "a".repeat(64),
  compiledHash: "b".repeat(64),
  storage: { schema: "master", object: "partner", idField: "id" },
  fields: [
    {
      key: "id",
      storagePath: "id",
      type: "uuid",
      required: true,
      writableOn: [],
    },
  ],
  operations: { request_create: { code: "request_create", permissionCode: "request.create" } },
  listPresentation: { experience },
};
const context = {
  tenantId: "tenant",
  principalId: "user",
  planeKey: "neon",
  permissions: {
    operationBindings: [
      {
        entityCode: "partner",
        operationKey: "request_create",
        permissionCode: "request.create",
        requiredScopeKinds: [],
        decisionMode: "entity_resource",
      },
    ],
  },
} as unknown as VerifiedRequestContext;
const scope: RecordCollectionScopeResolution = {
  status: "ready",
  authorizationResource: { operatingOrganizationId: "org1" },
  constraints: [],
  labels: [],
  fingerprintMaterial: {},
};
const authorizer: Authorizer = {
  authorize: vi.fn(async () => ({ allowed: true as const })),
};
function withAction(change: Record<string, unknown>): EntityRuntimeDescriptor {
  return {
    ...descriptor,
    listPresentation: {
      experience: parsePublishedListExperience({
        ...experience,
        actions: [{ ...experience.actions[0], ...change }],
      }),
    },
  };
}
describe("published list header and action authority", () => {
  it("resolves locale and regional fallback without pluralizing English entity names", () => {
    expect(resolveEntityText(text, "ms-MY")).toBe("Mulakan permohonan");
    expect(resolveEntityText(text, "fr-FR")).toBe("Start request");
    expect(() =>
      parsePublishedListExperience({
        ...experience,
        header: { title: { defaultLocale: "en", values: { ms: "Tajuk" } } },
      }),
    ).toThrow();
  });
  it("resolves a published target only after bound operation authorization", async () => {
    const result = await effectiveListActions(
      authorizer,
      context,
      descriptor,
      scope,
    );
    expect(result).toMatchObject([
      { state: "enabled", href: "/requests/new", localizedLabel: text },
    ]);
    expect(authorizer.authorize).toHaveBeenCalledWith({
      context,
      permissionCode: "request.create",
      observation: { entityCode: "partner", operationKey: "request_create", surface: "action", phase: "discover" },
      resource: {
        tenantId: "tenant",
        entityCode: "partner",
        resourceCode: "partner",
        operationKey: "request_create",
        operatingOrganizationId: "org1",
      },
    });
    expect(result[0]).not.toHaveProperty("permissions");
  });
  it("hides actions when grants, plane, or published operation bindings do not match", async () => {
    expect(
      await effectiveListActions(
        {
          authorize: async () => ({
            allowed: false,
            reason: "missing_permission",
          }),
        },
        context,
        descriptor,
        scope,
      ),
    ).toEqual([]);
    expect(
      await effectiveListActions(
        authorizer,
        { ...context, planeKey: "mesh" },
        descriptor,
        scope,
      ),
    ).toEqual([]);
    expect(
      await effectiveListActions(
        authorizer,
        {
          ...context,
          permissions: { ...context.permissions, operationBindings: [] },
        },
        descriptor,
        scope,
      ),
    ).toEqual([]);
  });
  it("disables missing context without exposing a navigable link", async () => {
    const result = await effectiveListActions(
      {
        authorize: async ({ resource }) =>
          resource
            ? { allowed: false, reason: "scope_coordinate_missing" }
            : { allowed: true },
      },
      context,
      descriptor,
      scope,
    );
    expect(result[0]).toMatchObject({
      state: "disabled",
      disabledReason: { code: "context_required" },
    });
    expect(result[0]).not.toHaveProperty("href");
  });
  it("never treats unresolved capability or lifecycle rules as permission grants", async () => {
    const rule = {
      key: "active",
      priority: 0,
      decision: "allow",
      lifecycleStateCode: "active",
    };
    expect(
      await effectiveListActions(
        authorizer,
        context,
        withAction({ rules: [rule] }),
        scope,
      ),
    ).toMatchObject([
      { state: "disabled", disabledReason: { code: "preflight_required" } },
    ]);
    expect(
      await effectiveListActions(
        authorizer,
        context,
        withAction({ rules: [{ key: "deny", priority: 0, decision: "deny" }] }),
        scope,
      ),
    ).toEqual([]);
  });
  it("rejects unregistered destinations, duplicate primary actions, and external URLs", () => {
    expect(() =>
      parsePublishedListExperience({ ...experience, routes: [] }),
    ).toThrow();
    expect(() =>
      parsePublishedListExperience({
        ...experience,
        actions: [
          ...experience.actions,
          { ...experience.actions[0], key: "second" },
        ],
      }),
    ).toThrow();
    for (const href of [
      "https://example.com",
      "//example.com",
      "/%2fexample",
      "/\\evil",
      "javascript:alert(1)",
    ])
      expect(() =>
        parsePublishedListExperience({
          ...experience,
          routes: [{ surfaceKey: "request_form", href }],
        }),
      ).toThrow();
  });
});

it("round trips localized header and effective actions without leaking authored permissions", async () => {
  const actions = await effectiveListActions(
    authorizer,
    context,
    descriptor,
    scope,
  );
  const compiled = compileEntityListDescriptor(
    context,
    descriptor,
    descriptor.fields,
    undefined,
    scope,
    undefined,
    actions,
  );
  const parsed = parseEntityListDescriptor(
    JSON.parse(JSON.stringify(compiled)),
  );
  expect(parsed.surface.header).toEqual(experience.header);
  expect(parsed.actions[0]?.localizedLabel).toEqual(text);
  expect(parsed.actions[0]?.href).toBe("/requests/new");
  expect(JSON.stringify(parsed)).not.toContain("request.create");
});

it("does not reveal a context-disabled action to a principal without its base grant", async () => {
  const denied: Authorizer = {
    authorize: async ({ resource }) => ({
      allowed: false,
      reason: resource ? "scope_coordinate_missing" : "missing_permission",
    }),
  };
  expect(
    await effectiveListActions(denied, context, descriptor, scope),
  ).toEqual([]);
});

it("requires the declared relation resolver provenance, not just a coordinate", async () => {
  const scoped = withAction({
    scopes: [
      {
        plane: "neon",
        scopeKind: "operating_organization",
        coordinateSource: "relation_resolver",
        resolverKey: "partner.organization.v1",
        decisionMode: "entity_resource",
      },
    ],
  });
  const bound = {
    ...context,
    permissions: {
      ...context.permissions,
      operationBindings: [
        {
          ...context.permissions.operationBindings![0]!,
          requiredScopeKinds: ["operating_organization"],
        },
      ],
    },
  };
  expect(
    await effectiveListActions(authorizer, bound, scoped, scope),
  ).toMatchObject([{ state: "disabled" }]);
  expect(
    await effectiveListActions(authorizer, bound, scoped, {
      ...scope,
      fingerprintMaterial: { resolver: "partner.organization.v1" },
    }),
  ).toMatchObject([{ state: "enabled" }]);
});

describe("entity section navigation", () => {
  const navigationDescriptor = (change: Record<string, unknown> = {}): EntityRuntimeDescriptor => ({ ...descriptor, listPresentation: { experience: parsePublishedListExperience({ ...experience, navigation: [{ ...experience.actions[0], placement: "direct", kind: "review", workflowKey: "review_flow", attentionCountKey: "my_reviews", ...change }] }) } });
  it("requires explicit review workflow and unique destinations", () => {
    expect(() => navigationDescriptor({ workflowKey: undefined })).toThrow(/workflow/);
    expect(() => parsePublishedListExperience({ ...experience, routes: [...experience.routes, {surfaceKey:"duplicate",href:"/requests/new"}] })).toThrow(/Duplicate/);
  });
  it("resolves counts only after authorization and preserves unknown on failure", async () => {
    const { effectiveEntityNavigation } = await import("../list-experience.js");
    const count = vi.fn(async () => 3);
    const sections = await effectiveEntityNavigation(authorizer,context,navigationDescriptor(),scope,{my_reviews:count});
    expect(sections[0]?.attentionCount).toBe(3);
    expect(count).toHaveBeenCalledWith({context,descriptor:navigationDescriptor(),scope});
    expect((await effectiveEntityNavigation(authorizer,context,navigationDescriptor(),scope,{}))[0]?.attentionCount).toBeUndefined();
    expect((await effectiveEntityNavigation(authorizer,context,navigationDescriptor(),scope,{my_reviews:async()=>{throw new Error("Unavailable");}}))[0]?.attentionCount).toBeUndefined();
    count.mockClear();
    expect(await effectiveEntityNavigation({authorize:async()=>({allowed:false,reason:"permission_denied"})} as Authorizer,context,navigationDescriptor(),scope,{my_reviews:count})).toEqual([]);
    expect(count).not.toHaveBeenCalled();
  });
  it("hides sections needing unresolved evidence and re-evaluates changed context", async () => {
    const { effectiveEntityNavigation } = await import("../list-experience.js");
    expect(await effectiveEntityNavigation(authorizer,context,navigationDescriptor({requiresPreflight:true}),scope)).toEqual([]);
    expect(await effectiveEntityNavigation(authorizer,{...context,permissions:{...context.permissions,operationBindings:[]}},navigationDescriptor(),scope)).toEqual([]);
  });
});

it("resolves application access independently of master-record read access without exposing columns",async()=>{
  const {createEntityListService}=await import("../entity-list-service.js");
  const {parseEntityApplicationDescriptor}=await import("@athyper/contract-platform-entity-list");
  const appDescriptor={...descriptor,listPresentation:{experience:parsePublishedListExperience({...experience,application:{key:"partner",basePath:"/requests/new",defaultSectionKey:"review"},navigation:[{...experience.actions[0],key:"review",placement:"direct",kind:"review",workflowKey:"flow",content:{kind:"task_list",entityCode:"partner_request"}}]})}};
  const execute=vi.fn();
  const service=createEntityListService({metadata:{getEntityDescriptor:async()=>appDescriptor} as never,authorizer,listExecutor:{execute} as never,collectionScopes:{resolve:async()=>scope}});
  const result=parseEntityApplicationDescriptor(await service.applicationDescriptor(context,"partner"));
  expect(result.navigation?.[0]?.content?.entityCode).toBe("partner_request");
  expect(result).not.toHaveProperty("fields");
  expect(result.surface).not.toHaveProperty("defaultState");
  expect(execute).not.toHaveBeenCalled();
});

it("admits directory navigation without widening governed actions", async () => {
  const scoped: Authorizer = { authorize: vi.fn(async ({ resource }) => resource
    ? { allowed: false as const, reason: "scope_not_contained" }
    : { allowed: true as const }) };
  const directory = { ...descriptor, directoryScope: { schemaVersion: 1 as const, mode: "tenant" as const } };
  expect(await effectiveListActions(scoped, context, directory, scope)).toHaveLength(0);
  expect(await effectiveListActions(scoped, context, directory, scope, true)).toHaveLength(1);
  expect(await effectiveListActions(scoped, context, descriptor, scope, true)).toHaveLength(0);
});
