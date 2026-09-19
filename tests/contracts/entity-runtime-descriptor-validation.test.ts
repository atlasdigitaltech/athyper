import assert from "node:assert/strict";
import test from "node:test";
import {
  parseEntityDetailDescriptor,
  parseEntityFormDescriptor,
  parseEntityRecord,
} from "../../packages/contracts/platform/entity-runtime/src/index";

/**
 * Task 4 (build-work-plan.md) asks for negative-fixture coverage of the shared entity
 * descriptor contract. This contract already exists and already validates — schema-tag
 * checks, duplicate-field detection, typed field kinds, revision-hash format — but had zero
 * test coverage anywhere in the repo before this file. These are real parsers already used
 * by EntityFormRuntime/EntityDetailRuntime, not a new contract.
 */

const validRevision = {
  release: 1,
  descriptorHash: "a".repeat(64),
  surfaceHash: "b".repeat(64),
};

const validEntity = { code: "asset", label: "Asset", pluralLabel: "Assets" };

function validFormDescriptor(overrides: Record<string, unknown> = {}) {
  return {
    schema: "athyper.entity-form-descriptor/1",
    plane: "neon",
    entity: validEntity,
    revision: validRevision,
    mode: "create",
    title: "New Asset",
    description: "Create a new asset record.",
    fields: [
      { key: "name", label: "Name", kind: "string", required: true, readOnly: false },
    ],
    submit: { operation: "create", label: "Create" },
    ...overrides,
  };
}

function validDetailDescriptor(overrides: Record<string, unknown> = {}) {
  return {
    schema: "athyper.entity-detail-descriptor/1",
    plane: "neon",
    entity: validEntity,
    revision: validRevision,
    titleField: "name",
    fields: [
      { key: "name", label: "Name", kind: "string", required: true, readOnly: false },
    ],
    actions: [{ code: "edit", label: "Edit", kind: "edit" }],
    ...overrides,
  };
}

test("parseEntityFormDescriptor accepts a valid descriptor", () => {
  const parsed = parseEntityFormDescriptor(validFormDescriptor());
  assert.equal(parsed.mode, "create");
  assert.equal(parsed.fields.length, 1);
});

test("parseEntityFormDescriptor rejects a wrong or missing schema tag", () => {
  assert.throws(() => parseEntityFormDescriptor(validFormDescriptor({ schema: "athyper.entity-detail-descriptor/1" })), /schema/);
  assert.throws(() => parseEntityFormDescriptor(validFormDescriptor({ schema: undefined })), /schema/);
});

test("parseEntityFormDescriptor rejects an invalid mode instead of defaulting", () => {
  assert.throws(() => parseEntityFormDescriptor(validFormDescriptor({ mode: "publish" })), /mode/);
});

test("parseEntityFormDescriptor rejects a duplicate field key", () => {
  const descriptor = validFormDescriptor({
    fields: [
      { key: "name", label: "Name", kind: "string", required: true, readOnly: false },
      { key: "name", label: "Name again", kind: "string", required: false, readOnly: false },
    ],
  });
  assert.throws(() => parseEntityFormDescriptor(descriptor), /duplicate field name/);
});

test("parseEntityFormDescriptor rejects an unknown field kind rather than passing it through", () => {
  const descriptor = validFormDescriptor({
    fields: [{ key: "name", label: "Name", kind: "currency-amount", required: true, readOnly: false }],
  });
  assert.throws(() => parseEntityFormDescriptor(descriptor), /kind/);
});

test("parseEntityFormDescriptor rejects a malformed revision hash", () => {
  const descriptor = validFormDescriptor({ revision: { ...validRevision, descriptorHash: "not-a-hash" } });
  assert.throws(() => parseEntityFormDescriptor(descriptor), /descriptorHash/);
});

test("parseEntityDetailDescriptor accepts a valid descriptor", () => {
  const parsed = parseEntityDetailDescriptor(validDetailDescriptor());
  assert.equal(parsed.titleField, "name");
  assert.equal(parsed.actions.length, 1);
});

test("parseEntityDetailDescriptor rejects a broken action reference (invalid kind)", () => {
  const descriptor = validDetailDescriptor({
    actions: [{ code: "archive", label: "Archive", kind: "delete" }],
  });
  assert.throws(() => parseEntityDetailDescriptor(descriptor), /actions\[0\]\.kind/);
});

test("parseEntityDetailDescriptor rejects a titleField that is not a valid code", () => {
  const descriptor = validDetailDescriptor({ titleField: "Not A Code!" });
  assert.throws(() => parseEntityDetailDescriptor(descriptor), /titleField/);
});

test("parseEntityRecord accepts a valid record and rejects a missing identity", () => {
  const parsed = parseEntityRecord({ id: "abc-123", version: 4, values: { name: "Test" } });
  assert.equal(parsed.id, "abc-123");
  assert.equal(parsed.version, 4);
  assert.throws(() => parseEntityRecord({ values: {} }), /identity/);
});
