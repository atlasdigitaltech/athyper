import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import {
  adaptEntityCollection,
  activityCollectionExample,
  parseCollectionConfiguration,
  parseCollectionState,
} from "@athyper/contract-platform-collection";
import { collectionPublicationFromGraph } from "@athyper/server-contract-publication";
import {
  validateGraph,
  compileGraph,
  runContractTests,
} from "../deterministic.js";
const graph = (kind: string) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../../../../../../tooling/fixtures/collections/${kind}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
it.each(["notifications", "inbox"])(
  "validates and deterministically compiles native %s collection",
  (kind) => {
    const g = graph(kind);
    expect(validateGraph(g).issues).toEqual([]);
    expect(runContractTests(g).passed).toBe(true);
    expect(compileGraph(g).descriptor.collectionConfiguration).toEqual(
      collectionPublicationFromGraph(g),
    );
    expect(compileGraph(g).descriptorHash).toBe(
      compileGraph(structuredClone(g)).descriptorHash,
    );
  },
);
it("rejects unsupported providers, operators, renderers, actions and versions", () => {
  const c = activityCollectionExample("inbox");
  for (const patch of [
    { providerKey: "unregistered" },
    { rendererKey: "arbitrary.script" },
    { actionKeys: ["complete"] },
    { viewVersion: 2 },
    { fields: [{ ...c.fields[0], operators: ["execute_sql"] }] },
  ])
    expect(() => parseCollectionConfiguration({ ...c, ...patch })).toThrow();
  expect(() =>
    parseCollectionState({ ...c.defaultState, group: "summary" }, c.fields),
  ).toThrow(/Grouping/);
  expect(() =>
    parseCollectionState(
      {
        ...c.defaultState,
        filters: [{ field: "priority", operator: "eq", value: "invalid" }],
      },
      c.fields,
    ),
  ).toThrow(/choice/);
});
it("rejects mixed entity operations and configuration graphs", () => {
  const g = graph("inbox");
  g.operations = [
    {
      operationKey: "complete",
      operationKind: "custom",
      label: "Complete",
      auditEventCode: "complete",
    },
  ];
  expect(() => collectionPublicationFromGraph(g)).toThrow(/operations/);
});
it("adapts the existing BP field contract without adding fake record metadata", () => {
  const descriptor = {
    schemaVersion: 1,
    plane: "neon",
    entity: { code: "business_partner", pluralLabel: "Business Partners" },
    surface: {
      title: "Business Partners",
      defaultState: {
        filters: [{ field: "status", operator: "eq", value: "active" }],
        sort: [{ field: "name", direction: "asc" }],
        density: "comfortable",
      },
      filterPresentation: {
        quickFields: [{ field: "status", defaultOperator: "eq" }],
      },
    },
    fields: [
      {
        key: "name",
        label: "Registered name",
        valueKind: "string",
        filterOperators: ["contains"],
        sortable: true,
        groupable: false,
      },
      {
        key: "status",
        label: "Status",
        valueKind: "enum",
        filterOperators: ["eq"],
        sortable: false,
        groupable: true,
        filterOptions: [{ value: "active", label: "Active" }],
      },
    ],
    actions: [],
    limits: { allowedPageSizes: [25, 50, 100] },
  };
  const c = adaptEntityCollection(descriptor as never);
  expect(c.collectionKey).toBe("entity.business_partner");
  expect(c.defaultState.filters).toEqual(
    descriptor.surface.defaultState.filters,
  );
  expect(c.quickFields).toEqual(["status"]);
});
