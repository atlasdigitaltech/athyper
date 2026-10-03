import { expect, it } from "vitest";
import { parseEntityRuntimeDescriptor } from "./descriptor-parser.js";
import { parseEntityRecordPresentation, validateRelatedPresentationOwner } from "@athyper/contract-platform-entity-runtime";

const field = (list: Record<string, unknown>) => ({
  key: "code",
  storagePath: "code",
  type: "string",
  required: true,
  writableOn: [],
  list,
});
const row = (list: Record<string, unknown>) => ({
  entity_code: "country",
  release_id: "release-1",
  release_no: 1,
  entity_contract_hash: "a".repeat(64),
  compiled_hash: "b".repeat(64),
  plane_code: "neon",
  compiled_json: {
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: "country",
    planeKey: "neon",
    storage: {
      schema: "master",
      object: "country",
      idField: "id",
      tenantField: "tenant_id",
    },
    fields: [field(list)],
    operations: { read: { code: "read", permissionCode: "country.read" } },
  },
});

it("keeps a declared record-card priority", () => {
  expect(
    parseEntityRuntimeDescriptor(row({ cardPriority: "primary" })).fields[0]
      ?.list,
  ).toEqual({ cardPriority: "primary" });
});

it("rejects an unknown record-card priority instead of ignoring it", () => {
  expect(() =>
    parseEntityRuntimeDescriptor(row({ cardPriority: "top" })),
  ).toThrow("field.list.cardPriority is invalid");
});

it("retains a published UUID reference and rejects an implicit string-key join", () => {
  const value = row({});
  const reference = {
    ...value.compiled_json.fields[0]!,
    type: "uuid",
    referenceTargetEntity: "nation",
  };
  expect(
    parseEntityRuntimeDescriptor({
      ...value,
      compiled_json: { ...value.compiled_json, fields: [reference] },
    }).fields[0]?.referenceTargetEntity,
  ).toBe("nation");
  expect(() =>
    parseEntityRuntimeDescriptor({
      ...value,
      compiled_json: {
        ...value.compiled_json,
        fields: [{ ...reference, type: "string" }],
      },
    }),
  ).toThrow("Entity references require a UUID field");
});

it("does not trust readiness embedded in a published artifact", () => {
  const value = row({});
  const descriptor = parseEntityRuntimeDescriptor({
    ...value,
    compiled_json: {
      ...value.compiled_json,
      capabilityReadiness: {
        ready: true,
        available: ["entity_read_record"],
        unavailable: [],
      },
    },
  });
  expect(descriptor).not.toHaveProperty("capabilityReadiness");
});

it("keeps declared platform-row read visibility only with an owning tenant column", () => {
  const value = row({});
  const withVisibility = (storage: Record<string, unknown>) =>
    parseEntityRuntimeDescriptor({ ...value, compiled_json: { ...value.compiled_json, storage } });
  expect(withVisibility({ ...value.compiled_json.storage, tenantVisibility: "tenant_or_platform" }).storage.tenantVisibility).toBe("tenant_or_platform");
  expect(withVisibility(value.compiled_json.storage).storage.tenantVisibility).toBeUndefined();
  expect(() => withVisibility({ ...value.compiled_json.storage, tenantVisibility: "everyone" })).toThrow("storage.tenantVisibility is invalid");
  const { tenantField: _tenant, ...unowned } = value.compiled_json.storage;
  expect(() => withVisibility({ ...unowned, tenantVisibility: "tenant_or_platform" })).toThrow("requires storage.tenantField");
});

function legacyRelated() {
  const base = row({});
  return {
    ...base,
    compiled_json: {
      ...base.compiled_json,
      recordPresentation: {
        schemaVersion: 1, titleField: "code", actions: [],
        sections: [{ key: "contacts", label: "Contacts", fields: [] }],
        related: [{ schemaVersion: 1, key: "contact", sectionKey: "contacts",
          source: "contact-person.v1", titleField: "displayName", emptyLabel: "No contacts",
          viewAllLabel: "View contacts", scopeLabel: "Record", groups: [] }],
      },
    },
  };
}

it("omits non-executable legacy DTO hints without modifying published bytes or inventing relationships", () => {
  const source = legacyRelated(), before = structuredClone(source);
  const descriptor = parseEntityRuntimeDescriptor(source);
  expect(descriptor.recordPresentation?.related).toBeUndefined();
  expect(descriptor.recordPresentation?.entityRelationships).toBeUndefined();
  expect(descriptor.compiledHash).toBe(source.compiled_hash);
  expect(descriptor.operations.read?.permissionCode).toBe("country.read");
  expect(source).toEqual(before);
  // The authoring validator remains strict: this cannot be a new relationship
  // declaration or a grant to read the target merely because runtime can decode it.
  const presentation = parseEntityRecordPresentation(source.compiled_json.recordPresentation);
  expect(() => validateRelatedPresentationOwner(presentation.related!, "country", presentation.entityRelationships))
    .toThrow("No published related record relationship");
});

it("still rejects explicit missing or contradictory relationship declarations", () => {
  const source = legacyRelated();
  const p = source.compiled_json.recordPresentation;
  for (const presentation of [
    { ...p, related: p.related.map(profile => ({ ...profile, relationshipKey: "contacts" })) },
    { ...p, entityRelationships: [] },
    { ...p, sections: p.sections.map(section => ({ ...section, relationshipKey: "contacts" })) },
  ]) {
    expect(() => parseEntityRuntimeDescriptor({ ...source, compiled_json: {
      ...source.compiled_json, recordPresentation: presentation,
    } })).toThrow();
  }
});

it("does not hide malformed legacy display metadata", () => {
  const source = legacyRelated();
  expect(() => parseEntityRuntimeDescriptor({ ...source, compiled_json: {
    ...source.compiled_json, recordPresentation: {
      ...source.compiled_json.recordPresentation,
      related: [{ ...source.compiled_json.recordPresentation.related[0], source: "arbitrary-sql-owner" }],
    },
  } })).toThrow();
});

it("rejects a directory binding whose scope field is unavailable or not immutable UUID storage", () => {
  const source = row({});
  const scoped = { ...source, compiled_json: { ...source.compiled_json,
    directoryScope: { schemaVersion: 1, mode: "organization", fieldBinding: { resolver: "neon.directory.fields.v1", organizationField: "org_id" } },
  } };
  expect(() => parseEntityRuntimeDescriptor(scoped)).toThrow("immutable stored UUID field");
  const scopeField = { key: "org_id", storagePath: "org_id", type: "uuid", required: true, writableOn: [] };
  expect(parseEntityRuntimeDescriptor({ ...scoped, compiled_json: { ...scoped.compiled_json, fields: [scopeField] } }).directoryScope?.fieldBinding?.organizationField).toBe("org_id");
  expect(() => parseEntityRuntimeDescriptor({ ...scoped, compiled_json: { ...scoped.compiled_json, fields: [{ ...scopeField, writableOn: ["patch"] }] } })).toThrow("immutable stored UUID field");
});
