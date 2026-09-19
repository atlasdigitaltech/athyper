// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  EntityLookup,
  EntityReferenceLookup,
  type EntityLookupAdapters,
} from "@athyper/platform-entity-form-detail";
import {
  parseEntityLookupField,
  parseEntityLookupOptions,
  intakeSurfaceValues,
} from "@athyper/contract-platform-entity-runtime";
import { compileEntityIntakeSurfaces } from "../../../../../server/packages/platform/metadata/src/intake-surface-projection";
import {
  withIntakeChoiceSurface,
  withBusinessPartnerLookup,
  businessPartnerRoleSurface,
} from "../../../../../server/db/scripts/provisioning/intake-choice-surfaces";
import fixture from "./lookup-test-fixture.json";
import { withBusinessPartnerEntryPolicy } from "../../../../../server/db/scripts/provisioning/business-partner-entry-policy";
import { searchLookupDirectory, type LookupDescriptorCache } from "../../../../platform/entity/runtime/list-view/src/lookup-directory";
import {
  entityListDescriptorOperation,
  entityListOperation,
  recordBookmarkMembershipOperation,
} from "@athyper/platform-api-client";
const client = {
  request: async (operation: unknown) =>
    operation === entityListDescriptorOperation
      ? {
          ...fixture.descriptor,
          entity: { ...fixture.descriptor.entity, code: "product" },
        }
      : operation === recordBookmarkMembershipOperation
        ? new Set()
        : {
            ...fixture.page,
            rows: [
              { id: "p1", values: { code: "A", name: "Product A" } },
              { id: "p2", values: { code: "B", name: "Product B" } },
            ],
          },
} as any;
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const base = () => ({
  key: "product",
  control: "entityLookup",
  required: false,
  label: "Product",
  lookup: {
    targetEntity: "product",
    adapterKey: "product.reference",
    searchLabel: "Search products",
    emptyMessage: "No products",
    resultsMessage: "Select a product",
    moreMessage: "Refine search",
    result: { titleFields: ["name"], detailFields: [] },
    actions: [{ key: "select", kind: "select", label: "Select" }],
    presentation: { viewType: "full", fullViewHost: "dialog" },
  },
});
it("reuses scoped lookup metadata, bounds pages, and invalidates changed authority", async () => {
  const calls: string[] = [], cache: LookupDescriptorCache = {};
  let changed = false;
  const scopedClient = { request: async (operation: unknown, input: any) => {
    if (operation === entityListDescriptorOperation) {
      calls.push("descriptor");
      return {...fixture.descriptor, entity:{...fixture.descriptor.entity,code:"product"}, limits:{...fixture.descriptor.limits,defaultPageSize:100,allowedPageSizes:[10,25,50,100]}};
    }
    calls.push("rows");
    expect(input.query.limit).toBe(50);
    return {...fixture.page,...(changed?{scopeFingerprint:"changed"}:{})};
  }} as any;
  const options = parseEntityLookupOptions(base().lookup), signal = new AbortController().signal;
  await searchLookupDirectory(scopedClient,"product",options,"one",signal,undefined,cache);
  await searchLookupDirectory(scopedClient,"product",options,"two",signal,undefined,cache);
  expect(calls).toEqual(["descriptor","rows","rows"]);
  changed = true;
  await expect(searchLookupDirectory(scopedClient,"product",options,"three",signal,undefined,cache)).rejects.toThrow("authority changed");
  expect(cache.descriptor).toBeUndefined();
});
const click = async (text: string) => {
  await act(async () => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === text);
    expect(button).toBeTruthy();
    button!.click();
  });
  await act(async () => { await vi.dynamicImportSettled(); });
};
it("validates metadata combinations and compiles storage-free lookup without forwarding its query", () => {
  expect(() =>
    parseEntityLookupOptions({ mode: "browse", selectionMode: "single" }),
  ).toThrow();
  expect(() =>
    parseEntityLookupOptions({ mode: "choose", recordAccess: "manage" }),
  ).toThrow();
  expect(() =>
    parseEntityLookupOptions({ creation: { showIn: ["full"] } }),
  ).toThrow();
  expect(() =>
    parseEntityLookupOptions({
      views: { defaultViewKey: "x", allowedViewKeys: ["y"] },
    }),
  ).toThrow();
  const graph = withBusinessPartnerLookup(
    withIntakeChoiceSurface(
      {
        entity: { entityCode: "business_partner" },
        fields: [],
        operations: [],
      } as any,
      businessPartnerRoleSurface,
    ),
  );
  const surface = compileEntityIntakeSurfaces(graph as any)[0]!;
  expect(surface.sections[1]!.fields[0]!.control).toBe("entityLookup");
  expect(
    intakeSurfaceValues(surface, {
      requested_role: "customer",
      partner_lookup: "secret query",
    }),
  ).toEqual({ requested_role: "customer" });
  expect(withBusinessPartnerLookup(graph)).toEqual(graph);
});
it("fails closed for an unregistered target adapter", async () => {
  await act(async () =>
    root.render(
      <EntityLookup
        field={parseEntityLookupField(base())}
        answers={{}}
        adapters={{}}
      />,
    ),
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "compatible",
  );
});
it("uses the shared chooser for a product reference and cancels provisional selection", async () => {
  const change = vi.fn(),
    field = parseEntityLookupField(base());
  const adapters: EntityLookupAdapters = {
    "product.reference": {
      targetEntity: "product",
      client,
      actions: ["select"],
            resolveActions: async () => ({ select: { state: "enabled" }, creation: {} }),
      validateSelection: async (rows) => rows,
    },
  };
  await act(async () =>
    root.render(
      <EntityLookup
        field={field}
        answers={{}}
        adapters={adapters}
        onChange={change}
      />,
    ),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Choose records");
  await act(async () =>
    document
      .querySelector<HTMLInputElement>('input[aria-label="Select A"]')!
      .click(),
  );
  await click("Cancel");
  expect(change).not.toHaveBeenCalled();
  await click("Choose records");
  await act(async () =>
    document
      .querySelector<HTMLInputElement>('input[aria-label="Select A"]')!
      .click(),
  );
  await click("Select");
  expect(change.mock.calls[0]![0][0]).toMatchObject({
    id: "p1",
    values: { code: "A", name: "Product A" },
  });
});
it("returns explicit multiple references only on confirmation", async () => {
  const config = base();
  (config.lookup as any).selectionMode = "multiple";
  const change = vi.fn();
  await act(async () =>
    root.render(
      <EntityReferenceLookup
        field={parseEntityLookupField(config)}
        cardinality="many"
        rows={[]}
        adapters={{
          "product.reference": {
            targetEntity: "product",
            client,
            actions: ["select"],
            resolveActions: async () => ({ select: { state: "enabled" }, creation: {} }),
            validateSelection: async (rows) => rows,
          },
        }}
        onChange={change}
      />,
    ),
  );
  await click("Choose records");
  await act(async () => {
    document
      .querySelector<HTMLInputElement>('input[aria-label="Select A"]')!
      .click();
  });
  await act(async () => {
    document
      .querySelector<HTMLInputElement>('input[aria-label="Select B"]')!
      .click();
  });
  expect(change).not.toHaveBeenCalled();
  await click("Use selected records (2)");
  expect(change.mock.calls[0]![0]).toEqual(["p1", "p2"]);
});
it("does not assign a reference when its eligibility handler rejects selection", async () => {
  const change = vi.fn();
  await act(async () =>
    root.render(
      <EntityReferenceLookup
        field={parseEntityLookupField(base())}
        cardinality="one"
        rows={[]}
        adapters={{
          "product.reference": {
            targetEntity: "product",
            client,
            actions: ["select"],
            resolveActions: async () => ({ select: { state: "enabled" }, creation: {} }),
            validateSelection: async () => {
              throw Error("Product is unavailable");
            },
          },
        }}
        onChange={change}
      />,
    ),
  );
  await click("Choose records");
  await act(async () =>
    document
      .querySelector<HTMLInputElement>('input[aria-label="Select A"]')!
      .click(),
  );
  await click("Select");
  expect(change).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "unavailable",
  );
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
});
it("cancels compact searches on query edits and ignores late results", async () => {
  const config = base();
  config.lookup.presentation = { viewType: "compact", fullViewHost: "dialog" };
  (config.lookup as any).display = { defaults: { searchBehavior: "submit" } };
  let resolve: ((data: unknown) => void) | undefined,
    signal: AbortSignal | undefined;
  const request = vi.fn((op: unknown, input: any) => {
    if (op === entityListOperation) {
      signal = input.signal;
      return new Promise((r) => {
        resolve = r;
      });
    }
    return client.request(op, input);
  });
  await act(async () =>
    root.render(
      <EntityLookup
        field={parseEntityLookupField(config)}
        answers={{}}
        adapters={{
          "product.reference": {
            targetEntity: "product",
            client: { request } as any,
            actions: ["select"],
            resolveActions: async () => ({ select: { state: "enabled" }, creation: {} }),
            select: () => {},
          },
        }}
      />,
    ),
  );
  const input = container.querySelector<HTMLInputElement>("input")!;
  const type = async (text: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await type("old");
  await click("Search products");
  await type("new");
  expect(signal?.aborted).toBe(true);
  await act(async () =>
    resolve!({
      ...fixture.page,
      rows: [{ id: "old", values: { name: "Late result" } }],
    }),
  );
  expect(container.textContent).not.toContain("Late result");
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Browse all…"]')!.click());
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
});
it("Escape closes nested display settings while keeping the chooser open", async () => {
  const field = parseEntityLookupField(base());
  await act(async () =>
    root.render(
      <EntityLookup
        field={field}
        answers={{}}
        adapters={{
          "product.reference": {
            targetEntity: "product",
            client,
            actions: ["select"],
            resolveActions: async () => ({ select: { state: "enabled" }, creation: {} }),
            select: () => {},
          },
        }}
      />,
    ),
  );
  await click("Choose records");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('button[aria-label="Controls"]')!
      .click(),
  );
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.textContent?.includes("Display settings"))!
      .click(),
  );
  expect(document.querySelectorAll('[role="dialog"]').length).toBe(2);
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
  expect(document.querySelector('input[aria-label="Select A"]')).toBeTruthy();
});
it("reuses shared view filters and rejects an unavailable restricted default", async () => {
  const {lookupInitialState} = await import("../../../../platform/entity/runtime/list-view/src/lookup-directory");
  const shared = {...fixture.descriptor,viewCatalog:{views:[{id:"shared.active",scope:"shared",compatible:true,name:"Active",state:{...fixture.descriptor.surface.defaultState,filters:[{field:"status",operator:"eq",value:"active"}]}}]}} as any;
  const config = parseEntityLookupOptions({views:{defaultViewKey:"shared.active",allowedViewKeys:["shared.active"]}});
  const state = lookupInitialState(shared,config);
  expect(state.filters).toEqual([{field:"status",operator:"eq",value:"active"}]);
  expect(() => lookupInitialState(fixture.descriptor as any,config)).toThrow(/unavailable/);
});

it("rechecks reference authority at confirmation without requiring onboarding permission", async () => {
  let allowed = true;
  const change = vi.fn(), validate = vi.fn(async (rows) => rows);
  await act(async () => root.render(<EntityLookup field={parseEntityLookupField(base())} answers={{}} onChange={change} adapters={{
    "product.reference": { targetEntity: "product", client, actions: ["select"], validateSelection: validate,
      resolveActions: async () => ({ select: { state: allowed ? "enabled" : "hidden" }, creation: {} }) },
  }} />));
  await click("Choose records");
  await act(async () => document.querySelector<HTMLInputElement>('input[aria-label="Select A"]')!.click());
  allowed = false;
  await click("Select");
  expect(change).not.toHaveBeenCalled();
  expect(validate).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("not available");
});
it("renders authorized creation once in an empty directory and suppresses selection", async () => {
  const config: any = base();
  config.lookup.presentation.fullViewHost = "inline";
  config.lookup.creation = { showIn: ["full"], actionKey: "request", label: "Request product" };
  config.lookup.messages = { emptyTitle: "No products to display", emptyDescription: "Request a product below." };
  const emptyClient = { request: (op: unknown, input: unknown) => op === entityListOperation ? Promise.resolve({ ...fixture.page, rows: [] }) : client.request(op, input) } as any;
  const create = vi.fn();
  await act(async () => root.render(<EntityLookup field={parseEntityLookupField(config)} answers={{}} adapters={{
    "product.reference": { targetEntity: "product", client: emptyClient, actions: ["select", "create"], select: () => {}, create,
      creationActions: ["request"], resolveActions: async () => ({ select: { state: "enabled" }, creation: { request: { state: "enabled" } } }) },
  }} />));
  await act(async () => { await vi.dynamicImportSettled(); });
  expect(container.textContent).toContain("No products to display");
  expect(container.textContent).toContain("Request a product below.");
  expect([...container.querySelectorAll("button")].filter(b => b.textContent === "Request product")).toHaveLength(1);
  expect([...container.querySelectorAll("button")].some(b => b.textContent === "Select")).toBe(false);
  await click("Request product");
  expect(create).toHaveBeenCalledWith("request");
});
it("does not advertise creation when operation authority is absent", async () => {
  const config: any = base();
  config.lookup.presentation.fullViewHost = "inline";
  config.lookup.creation = { showIn: ["full"], actionKey: "request", label: "Request product" };
  config.lookup.messages = { emptyDescription: "Request a product below." };
  const emptyClient = { request: (op: unknown, input: unknown) => op === entityListOperation ? Promise.resolve({ ...fixture.page, rows: [] }) : client.request(op, input) } as any;
  await act(async () => root.render(<EntityLookup field={parseEntityLookupField(config)} answers={{}} adapters={{
    "product.reference": { targetEntity: "product", client: emptyClient, actions: ["select", "create"], select: () => {}, create: () => {},
      creationActions: ["request"], resolveActions: async () => ({ select: { state: "hidden" }, creation: {} }) },
  }} />));
  expect(container.textContent).not.toContain("Request product");
  expect(container.textContent).not.toContain("Request a product below.");
});

it("migrates only request entry and intake copy while preserving reviewed authorization and unrelated edits", () => {
  const seeded = withBusinessPartnerLookup(withIntakeChoiceSurface({ entity: { entityCode: "business_partner" }, fields: [], operations: [] } as any, businessPartnerRoleSurface));
  const source: any = { ...seeded,
    operations: [{ id: "request", operationKey: "request_supplier", inputSurfaceKey: "request_form" }],
    operationPermissions: [{ entityOperationId: "request", targetPlane: "neon", permissionCode: "neon.relationship.entity_case.create" }],
    operationScopeBindings: [{ entityOperationId: "request", scopeKind: "operating_organization" }],
    surfaces: [...seeded.surfaces!, { id: "list", surfaceKey: "manage", layoutConfig: { experience: { actionLabels: { custom: "Keep me" } }, authorization: { reviewed: "profile" }, authorizationRuntime: { reviewed: "admission" } } }],
    surfaceOperations: [{ entitySurfaceId: "list", entityOperationId: "request", placementKey: "new_supplier_request" }],
  };
  const snapshot = structuredClone(source), updated = withBusinessPartnerEntryPolicy(source);
  expect(source).toEqual(snapshot);
  expect(withBusinessPartnerEntryPolicy(updated)).toEqual(updated);
  expect(updated.operations).toEqual(source.operations);
  expect(updated.operationPermissions).toEqual(source.operationPermissions);
  expect(updated.operationScopeBindings).toEqual(source.operationScopeBindings);
  const host = updated.surfaces!.find(s => s.id === "list")!.layoutConfig!;
  expect(host["authorization"]).toEqual({ reviewed: "profile" });
  expect(host["authorizationRuntime"]).toEqual({ reviewed: "admission" });
  expect(host["experience"]).toEqual({ actionLabels: { custom: "Keep me" }, operationEntryPolicies: { request_supplier: "permission_only" } });
  expect(updated.surfaceFieldBindings![0]).toEqual(source.surfaceFieldBindings[0]);
});
