import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEntitySectionComponent, readableEntitySectionComponent } from "../../../packages/contracts/platform/entity-runtime/src/section-component";
import { parseEntityFormSections } from "../../../packages/contracts/platform/entity-runtime/src/form-sections";
import { parseEntityRecordPresentation, readableRecordPresentation } from "../../../packages/contracts/platform/entity-runtime/src/record-presentation";

const component = { rendererKey: "platform.address.fields.v1", bindings: { city: "city", country: "country_code" } };
test("registered Address components retain metadata field mappings in forms and details", () => {
  const sections = [{key:"address",label:"Address",fields:["country_code","city"],component}];
  assert.deepEqual(parseEntityFormSections(sections,["city","country_code"])![0]!.component,component);
  assert.deepEqual(parseEntityRecordPresentation({schemaVersion:1,titleField:"city",sections}).sections[0]!.component,component);
});
test("component metadata cannot load arbitrary renderers, URLs, values or hidden fields", () => {
  for (const candidate of [
    {...component,rendererKey:"custom.remote.renderer"}, {...component,url:"https://example.test"},
    {...component,bindings:{city:"secret"}}, {...component,bindings:{unknown:"city"}},
    {...component,bindings:{city:"city",country:"city"}},
  ]) assert.throws(()=>parseEntitySectionComponent(candidate,["city","country_code"]));
});
test("authorization pruning removes specialized bindings rather than retaining hidden dependency names", () => {
  const parsed = parseEntitySectionComponent(component,["city","country_code"]);
  assert.equal(readableEntitySectionComponent(parsed,["city"]),undefined);
  const presentation = parseEntityRecordPresentation({schemaVersion:1,titleField:"city",sections:[{key:"address",label:"Address",fields:["city","country_code"],component}]});
  const admitted = readableRecordPresentation(presentation,["city"],[],"city");
  assert.deepEqual(admitted.sections[0]!.fields,["city"]);
  assert.equal(admitted.sections[0]!.component,undefined);
  assert.equal(JSON.stringify(admitted).includes("country_code"),false);
});
