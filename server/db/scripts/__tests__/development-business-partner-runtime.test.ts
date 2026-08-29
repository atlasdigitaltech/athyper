import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildDevelopmentBusinessPartnerProjection } from "../provision-development-business-partner-runtime.js";

test("development business-partner publication is deterministic and browser-safe", () => {
  const permissionId = "04a1f105-978d-5906-b6df-0e7eb5c938bd";
  const first = buildDevelopmentBusinessPartnerProjection(permissionId);
  const second = buildDevelopmentBusinessPartnerProjection(permissionId);
  assert.deepEqual(first, second);
  assert.equal(first.publicationKey, "metadata.entity.business_partner");
  assert.equal(first.projection.descriptor.compiled_json.storage.schema, "master");
  assert.equal(first.projection.descriptor.compiled_json.storage.object, "business_partner");
  assert.equal(first.projection.descriptor.compiled_json.operations.read.permissionCode, "neon.relationship.business_partner.read");
  assert.equal(first.projection.descriptor.compiled_json.operations.import.permissionCode, "neon.relationship.business_partner.read");
  assert.equal(first.projection.descriptor.compiled_json.listPresentation.dataOperations.importAdapterKey, "neon.business_partner.operating_organization.v1");
  assert.equal(first.releaseNo, 8);
  assert.equal(first.projection.descriptor.compiled_json.detailRouteTemplate, "/app/business_partner/:recordId");
  assert.deepEqual(first.projection.descriptor.compiled_json.listPresentation.dataOperations.importFormats,["xlsx","csv","json"]);
  assert.equal(first.projection.contract.release_no, first.releaseNo);
  assert.equal(first.projection.contract.contract_json.runtime.writeMode, "governed_adapter");
  assert.equal(first.projection.descriptor.compiled_json.listPresentation.identityField, "code");
  assert.deepEqual(first.projection.descriptor.compiled_json.listPresentation.defaultState.columns, ["code", "display_name", "status", "partner_category", "registration_country_code", "updated_at"]);
  assert.deepEqual(first.projection.descriptor.compiled_json.listPresentation.filterPresentation.quickFields.map((item) => item.field), ["status", "partner_category", "registration_country_code", "updated_at"]);
  assert.equal(first.projection.descriptor.compiled_json.listPresentation.limits.defaultPageSize, 10);
  assert.deepEqual(first.projection.descriptor.compiled_json.operation_scope_bindings.map(item=>item.scopeKind), ["operating_organization"]);
  assert.match(first.artifactHash, /^[a-f0-9]{64}$/);
  assert.match(first.projection.descriptor.compiled_hash, /^[a-f0-9]{64}$/);
});

test("development business-partner reader covers onboarding aggregate reads", async () => {
  const source = await readFile(new URL("../provision-development-business-partner-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /neon\.relationship\.business_partner_request\.read/);
  assert.match(source, /provisionDevelopmentReaders\(client, \[permission,importPermission,updatePermission,requestReadPermission\]\)/);
});
