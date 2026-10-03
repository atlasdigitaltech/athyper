import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { applyEntityPlacements, readEntityPlacements } from "./generate-platform-catalog.mjs";

const routes = () => ({
  neon: [{ code: "mdg", routeSlug: "mdg", name: "MDG", modules: [{ code: "org", routeSlug: "organization-reference", name: "Org", entities: [] }] }],
  studio: [], mesh: [],
});
function entities(files) {
  const root = mkdtempSync(path.join(tmpdir(), "placements-"));
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, "entities", file)), { recursive: true });
    writeFileSync(path.join(root, "entities", file), JSON.stringify(body));
  }
  for (const directory of ["entities", "profiles", "review", "schemas"]) mkdirSync(path.join(root, directory), { recursive: true });
  writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ schema: "athyper.metadata-workspace/1", entitiesRoot: "entities", profilesRoot: "profiles", reviewRoot: "review", schemasRoot: "schemas" }));
  for (const code of new Set(Object.keys(files).map(file => file.split("/")[0]))) {
    const descriptor = { schema: "athyper.entity-source/1", entityCode: code, artifacts: [], placement: "placement.json", definition: "definition.json" };
    if (!files[`${code}/definition.json`]) writeFileSync(path.join(root, "entities", code, "definition.json"), "{}");
    writeFileSync(path.join(root, "entities", code, "entity.json"), JSON.stringify(descriptor));
  }
  return root;
}
const placement = (entityCode, placements, extra = {}) => ({ schema: "athyper.entity-placement/1", entityCode, ...extra, placements });

test("places entities in their modules, named from the definition title, sorted, with one default", async () => {
  const root = entities({
    "currency/placement.json": placement("currency", [{ plane: "neon", workspace: "mdg", module: "org", routeSlug: "currencies", default: true }]),
    "currency/definition.json": { definition: { title: { defaultText: "Currencies" } } },
    "country/placement.json": placement("country", [{ plane: "neon", workspace: "mdg", module: "org", routeSlug: "countries" }], { name: "Countries" }),
  });
  const module = applyEntityPlacements(routes(), await readEntityPlacements(root)).neon[0].modules[0];
  assert.deepEqual(module.entities.map((entity) => entity.code), ["country", "currency"]);
  assert.equal(module.defaultEntityCode, "currency");
});

test("rejects a placement in an absent module, a duplicate, a second default and an unnamed entity", async () => {
  const absent = entities({ "country/placement.json": placement("country", [{ plane: "neon", workspace: "mdg", module: "nope", routeSlug: "countries" }], { name: "Countries" }) });
  const absentPlacements = await readEntityPlacements(absent);
  assert.throws(() => applyEntityPlacements(routes(), absentPlacements), /absent module/);
  const twice = entities({ "country/placement.json": placement("country", [
    { plane: "neon", workspace: "mdg", module: "org", routeSlug: "countries" },
    { plane: "neon", workspace: "mdg", module: "org", routeSlug: "nations" },
  ], { name: "Countries" }) });
  await assert.rejects(async () => applyEntityPlacements(routes(), await readEntityPlacements(twice)), /twice/);
  const defaults = entities({
    "one/placement.json": placement("one", [{ plane: "neon", workspace: "mdg", module: "org", routeSlug: "one", default: true }], { name: "One" }),
    "two/placement.json": placement("two", [{ plane: "neon", workspace: "mdg", module: "org", routeSlug: "two", default: true }], { name: "Two" }),
  });
  await assert.rejects(async () => applyEntityPlacements(routes(), await readEntityPlacements(defaults)), /second default/);
  const unnamed = entities({ "one/placement.json": placement("one", [{ plane: "neon", workspace: "mdg", module: "org", routeSlug: "one" }]) });
  await assert.rejects(() => readEntityPlacements(unnamed), /needs a name/);
});
