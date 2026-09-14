import {test} from "node:test";
import assert from "node:assert/strict";
import type {MetaEntityGraph} from "@athyper/server-contract-meta-entity-authoring";
import {withBusinessPartnerOrganizationIdentity} from "../../server/db/scripts/provisioning/business-partner-organization-identity.js";

function fixture(): MetaEntityGraph {
  return {
    entity: {entityCode: "business_partner"},
    fields: [
      {id: "registered", fieldKey: "name"},
      {id: "display", fieldKey: "display_name"},
      {id: "legal", fieldKey: "legal_name"},
      {id: "legal-input", fieldKey: "details_legal_name"},
      {id: "name-input", fieldKey: "details_name"},
      {id: "category", fieldKey: "partner_category"},
      {id: "contact", fieldKey: "contact_contact_name"},
    ],
    searchFields: [{entityFieldId: "registered"}, {entityFieldId: "legal"}],
    surfaceFieldBindings: [
      {id: "title", entityFieldId: "display", labelOverride: "Display name"},
      {id: "old-input", entityFieldId: "legal-input", widgetKey: "input", displayConfig: {valueKey: "legalName", required: true}},
      {id: "name-binding", entityFieldId: "name-input", widgetKey: "input", displayConfig: {valueKey: "name", maxLength: 100}},
      {id: "category-binding", entityFieldId: "category", displayConfig: {lookup: {options: [{value: "person"}]}}},
      {id: "contact-binding", entityFieldId: "contact", widgetKey: "input", displayConfig: {valueKey: "contactName"}},
    ],
    surfaces: [{id: "list", layoutConfig: {identityField: "display_name", ai: {searchFieldKeys: ["name", "display_name", "legal_name"]}}}],
  } as unknown as MetaEntityGraph;
}

test("consolidates identity without mutating source, contact fields or reference policies", () => {
  const source = fixture(), result = withBusinessPartnerOrganizationIdentity(source);
  assert.equal(source.fields.length, 7);
  assert.deepEqual(result.fields.map(f => f.fieldKey), ["name", "details_name", "partner_category", "contact_contact_name"]);
  assert.equal(result.surfaceFieldBindings?.find(b => b.id === "title")?.entityFieldId, "registered");
  assert.equal(result.surfaceFieldBindings?.some(b => b.id === "old-input"), false);
  assert.deepEqual(result.surfaceFieldBindings?.find(b => b.id === "name-binding")?.displayConfig, {valueKey: "name", maxLength: 320, required: true});
  assert.deepEqual(result.surfaceFieldBindings?.find(b => b.id === "contact-binding"), source.surfaceFieldBindings?.find(b => b.id === "contact-binding"));
  assert.deepEqual(result.surfaces?.[0]?.layoutConfig?.ai, {searchFieldKeys: ["name"]});
  assert.deepEqual(withBusinessPartnerOrganizationIdentity(result), result);
});

test("refuses to orphan a key or policy binding during identity removal", () => {
  const source = {...fixture(), keyFields: [{entityFieldId: "legal"}] as MetaEntityGraph["keyFields"]};
  assert.throws(() => withBusinessPartnerOrganizationIdentity(source), /Retired name still owns keyFields/);
});
