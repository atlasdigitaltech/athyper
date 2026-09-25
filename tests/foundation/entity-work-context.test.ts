import assert from "node:assert/strict";
import test from "node:test";
import { entityWorkContext } from "../../apps/neon/lib/entity-work-context";
import { resolveRecordResourceContext } from "../../packages/platform/entity/runtime/form-detail/src/record/resolve-resource-context";
const work = {status: "ready", switching: false, selection: {mode: "company", legalEntityId: "le", companyCodeId: "company"}};
const orgs = {status: "ready", organizations: [{id: "org", companyAssignments: [{companyCodeId: "company"}]}]};
test("single resolved company and unique compatible organization flow to record scope", () => {
  assert.deepEqual(entityWorkContext(work, orgs), {legalEntityId: "le", companyCodeId: "company", operatingOrganizationId: "org"});
});
test("ambiguous or incompatible organizations are never guessed", () => {
  for (const organizations of [[...orgs.organizations, {id: "other", companyAssignments: [{companyCodeId: "company"}]}], [{id: "wrong", companyAssignments: [{companyCodeId: "other"}]}]]) {
    assert.deepEqual(entityWorkContext(work, {...orgs, organizations}), {legalEntityId: "le", companyCodeId: "company"});
  }
});
test("loading, switching and failed workspace catalogs cannot supply defaults", () => {
  assert.equal(entityWorkContext({...work, status: "loading"}, orgs), undefined);
  assert.equal(entityWorkContext({...work, status: "error"}, orgs), undefined);
  assert.equal(entityWorkContext({...work, switching: true}, orgs), undefined);
  assert.deepEqual(entityWorkContext(work, {...orgs, status: "loading"}), {legalEntityId: "le", companyCodeId: "company"});
});
test("resolved legal entity stays distinct from unresolved company", () => {
  assert.deepEqual(entityWorkContext({...work, selection: {mode: "unresolved"}, legalEntityId: "le"}, orgs), {legalEntityId: "le"});
});
test("explicit complete, partial or invalid URL scope is never supplemented with another company", () => {
  const defaults = entityWorkContext(work, orgs);
  for (const explicit of [{companyCodeId: "different"}, {legalEntityId: "different"}, {operatingOrganizationId: "different"}, undefined]) {
    assert.deepEqual(resolveRecordResourceContext(explicit, defaults, true), explicit);
  }
});
test("non-scope URL filters survive workspace inheritance and company switching", () => {
  const filter = {asOf: "2026-01-01", roleLens: "supplier"};
  assert.deepEqual(resolveRecordResourceContext(filter, entityWorkContext(work, orgs), false), {...entityWorkContext(work, orgs), ...filter});
  const next = entityWorkContext({...work, selection: {mode: "company", companyCodeId: "new", legalEntityId: "new-le"}}, orgs);
  assert.deepEqual(resolveRecordResourceContext(undefined, next, false), {legalEntityId: "new-le", companyCodeId: "new"});
});
