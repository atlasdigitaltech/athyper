import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverWorkspace } from "./source-workspace.mjs";

function fixture(work) {
  const root = mkdtempSync(join(tmpdir(), "classified-source-"));
  const write = (path, value) => writeFileSync(join(root, path), JSON.stringify(value));
  for (const directory of ["entities/domain/example", "profiles", "review", "schemas"]) mkdirSync(join(root, directory), { recursive: true });
  write("manifest.json", { schema: "athyper.metadata-workspace/1", entitiesRoot: "entities", profilesRoot: "profiles", reviewRoot: "review", schemasRoot: "schemas" });
  const descriptor = { schema: "athyper.entity-source/2", entityCode: "example", authoringOwnership: "platform", entityClass: null, ownershipModel: null, targets: { declared: ["neon"], required: ["studio", "neon", "mesh"], recommended: [] }, artifacts: ["core.json"] };
  write("entities/domain/example/core.json", { artifactType: "core", artifactKey: "example/core", entityCode: "example", plane: "neon" });
  const save = () => write("entities/domain/example/entity.json", descriptor);
  save();
  try { work({ root, descriptor, save, write }); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("required targets do not invent compiled planes or graph classification", () => fixture(({ root }) => {
  const source = discoverWorkspace(root).entities.get("example");
  assert.deepEqual(source.descriptor.targets.declared, ["neon"]);
  assert.equal(source.descriptor.entityClass, null);
  assert.equal(source.descriptor.placement, undefined);
}));

test("classification rejects malformed targets, missing properties and unsupported keys", () => {
  for (const mutate of [
    d => { d.targets.required.push("neon"); },
    d => { d.targets.required.push("other"); },
    d => { d.targets.recommended.push("studio"); },
    d => { delete d.targets.recommended; },
    d => { delete d.ownershipModel; },
    d => { d.authoringOwnership = "tenant"; },
    d => { d.targets.declared = ["mesh"]; },
    d => { d.entity_class = "reference"; },
    d => { d.entityClass = "buisness"; },
    d => { d.ownershipModel = "global"; },
  ]) fixture(({ root, descriptor, save }) => {
    mutate(descriptor); save();
    assert.throws(() => discoverWorkspace(root), /Metadata source configuration/);
  });
});

test("native identity, graph classification and authoring placement module must agree", () => fixture(({ root, descriptor, save, write }) => {
  const native = { schema: "athyper.table-entity-product/1", moduleCode: "iam", planes: ["neon"], definition: { entity: { entityCode: "example", entityClass: "configuration", ownershipModel: "system" } } };
  descriptor.definition = "definition.json";
  descriptor.entityClass = "configuration";
  descriptor.ownershipModel = "system";
  descriptor.placement = "placement.json";
  write("entities/domain/example/definition.json", native);
  write("entities/domain/example/placement.json", { schema: "athyper.entity-placement/1", entityCode: "example", placements: [{ plane: "neon", workspace: "core", module: "iam", routeSlug: "examples" }] });
  save();
  assert.doesNotThrow(() => discoverWorkspace(root));
  native.moduleCode = "ent";
  write("entities/domain/example/definition.json", native);
  assert.throws(() => discoverWorkspace(root), /moduleCode must match/);
  native.moduleCode = "iam";
  native.definition.entity.entityClass = "business";
  write("entities/domain/example/definition.json", native);
  assert.throws(() => discoverWorkspace(root), /classification must match/);
}));

test("v1 remains readable without accepting v2-only properties", () => fixture(({ root, descriptor, save }) => {
  descriptor.schema = "athyper.entity-source/1";
  assert.throws(() => { save(); discoverWorkspace(root); }, /unsupported descriptor properties/);
  for (const key of ["authoringOwnership", "entityClass", "ownershipModel", "targets"]) delete descriptor[key];
  save();
  assert.doesNotThrow(() => discoverWorkspace(root));
}));

test("repository classification preserves required and recommended coverage", () => {
  const workspace = discoverWorkspace();
  assert.equal(workspace.entities.size, 49);
  assert.equal([...workspace.entities.values()].filter(e => e.descriptor.targets.required.length === 3).length, 19);
  assert.equal([...workspace.entities.values()].filter(e => e.descriptor.targets.recommended.length === 3).length, 7);
  const native = workspace.documents.filter(d => ["athyper.shared-reference-product/1", "athyper.table-entity-product/1"].includes(d.value.schema));
  assert.equal(native.length, 15);
  assert.ok(native.every(d => d.value.moduleCode !== "ent"));
});
