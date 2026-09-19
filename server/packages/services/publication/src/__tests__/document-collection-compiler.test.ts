import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseEntityRuntimeDescriptor } from "@athyper/server-platform-metadata";
import {
  compileDocumentCollection,
  withDocumentCollectionSource,
} from "../document-collection-compiler.js";
const evidence = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../governance/policy/reports/business-partner-child-storage-20260912.compilation.dev.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const native = evidence.artifact.descriptor;
const catalog = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    code: "neon.relationship.entity_case.read",
    kind: "entity_operation" as const,
    scopeKinds: ["operating_organization"],
  },
];
it("converts the reviewed native graph to a runtime-consumable scoped child descriptor", () => {
  const compiled = compileDocumentCollection(native, "neon", catalog);
  const parsed = parseEntityRuntimeDescriptor({
    entity_code: "business_partner_request",
    release_id: "22222222-2222-4222-8222-222222222222",
    release_no: 1,
    entity_contract_hash: evidence.artifact.contractHash,
    plane_code: "neon",
    compiled_hash: "1".repeat(64),
    compiled_json: compiled,
  });
  expect(parsed.storage.object).toBe("entity_case");
  expect(parsed.collectionRelationship?.scope.contextRef).toBe(
    "operatingOrganizationId",
  );
  expect(parsed.fields).toHaveLength(7);
  expect(parsed.fields.every((f) => !f.writableOn.length)).toBe(true);
  expect(
    parsed.fields.find((f) => f.key === "tenant_id")?.list?.defaultVisible,
  ).toBe(false);
  expect(parsed.operations.read?.permissionCode).toBe(catalog[0]!.code);
  expect(compiled.operation_scope_bindings).toHaveLength(2);
});
it.each([
  "catalog",
  "scope",
  "storage",
  "field",
  "write",
  "subject",
  "runtime",
])("rejects incompatible %s without dropping policy", (mutation) => {
  const graph = structuredClone(native);
  if (mutation === "scope")
    graph.operationScopeBindings[0].scopeKind = "tenant";
  if (mutation === "storage")
    graph.runtimeProfiles[0].storageObject = "business_partner";
  if (mutation === "field") graph.fields[0].storagePath = "payload_json";
  if (mutation === "write") graph.runtimeProfiles[0].writeMode = "generic";
  if (mutation === "subject")
    graph.collectionRelationship.subject.value = "master.other_entity";
  if (mutation === "runtime") graph.authorizationRuntime = { schemaVersion: 1 };
  expect(() =>
    compileDocumentCollection(
      graph,
      "neon",
      mutation === "catalog" ? [] : catalog,
    ),
  ).toThrow();
});

it("binds deployment source identities without changing policy or field semantics", () => {
  const descriptor = compileDocumentCollection(native, "neon", catalog);
  const source = {
    entityId: "fd47abc3-3478-45fe-a197-6416fcc8ad73",
    releaseHash: "a".repeat(64),
  };
  const bound = withDocumentCollectionSource(descriptor, source);
  expect(bound.source).toEqual({
    entity_id: source.entityId,
    release_hash: source.releaseHash,
  });
  const { source: _, ...rest } = bound;
  expect(rest).toEqual(descriptor);
  expect(() =>
    withDocumentCollectionSource(descriptor, { ...source, releaseHash: "" }),
  ).toThrow("DOCUMENT_COLLECTION_SOURCE_REQUIRED");
  expect(() =>
    withDocumentCollectionSource(descriptor, { ...source, entityId: "" }),
  ).toThrow("DOCUMENT_COLLECTION_SOURCE_REQUIRED");
});
