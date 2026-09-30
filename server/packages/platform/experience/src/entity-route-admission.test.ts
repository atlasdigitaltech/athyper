import { expect, it } from "vitest";
import { admitEntityRoutes } from "./entity-route-admission.js";
import type { ExperienceCatalogRecord } from "./ports.js";
const catalog: ExperienceCatalogRecord = { planActive: true, planRevision: "1", permissions: [{ code: "example.view", moduleId: "module", revision: "1" }],
  associations: [{ workspaceCode: "platform", workspaceName: "Platform", workspaceSortOrder: 1, moduleId: "module", moduleCode: "reference", moduleName: "Reference", moduleSortOrder: 1, primary: true, revision: "1" }] };
const candidate = { entityCode: "example_dictionary", releaseId: "release", operations: { list: "example.view", read: "example.view" } };
it("needs both an allowed published permission and an entitled module association", () => {
  expect(admitEntityRoutes([candidate], catalog, ["example.view"])).toHaveLength(2);
  expect(admitEntityRoutes([candidate], catalog, [])).toEqual([]);
  expect(admitEntityRoutes([candidate], { ...catalog, associations: [] }, ["example.view"])).toEqual([]);
  expect(admitEntityRoutes([candidate], { ...catalog, permissions: [] }, ["example.view"])).toEqual([]);
  expect(admitEntityRoutes([{ ...candidate, entityCode: "../escape" }], catalog, ["example.view"])).toEqual([]);
});
it("does not infer read access from list, or select an ambiguous permission owner", () => {
  expect(admitEntityRoutes([{ ...candidate, operations: { list: "example.view" } }], catalog, ["example.view"]).map(x => x.operation)).toEqual(["list"]);
  expect(admitEntityRoutes([candidate], { ...catalog, permissions: [...catalog.permissions, { code: "example.view", moduleId: "other", revision: "1" }] }, ["example.view"])).toEqual([]);
});
