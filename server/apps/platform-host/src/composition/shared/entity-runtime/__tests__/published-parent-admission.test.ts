import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { buildSharedReferenceGraph, compileGraph } from "@athyper/server-plane-studio-meta-entity-authoring";
import { compileCompiledEntityArtifacts, lowerNativeRuntimePublication } from "@athyper/server-service-publication";
import type { EntityCapabilityRequest } from "@athyper/server-platform-experience";
import { createPublishedParentAdmission } from "../published-parent-admission.js";
import { createPublishedRecordHeader } from "../published-record-header.js";

function fixture() {
  const graph = buildSharedReferenceGraph({ entityCode: "test_dictionary", title: "Dictionary", storageObject: "test_dictionary", codeField: "code", titleField: "code",
    fields: [{ key: "id", label: "ID", type: "uuid", required: true }, { key: "code", label: "Code", type: "string", required: true }],
    columns: ["code"], searchFields: ["code"], sections: [{ key: "main", label: "Main", fields: ["code"] }],
    runtimeBindings: [{ operation: "list", handler: "entity.record.list.v1", resolver: "tenant.record.v1" }, { operation: "read", handler: "entity.record.read.v1", resolver: "tenant.record.v1" }],
  }, "neon");
  const persistedGraph = { ...graph,
    operationPermissions: graph.operationPermissions!.map((b, i) => ({ ...b, id: `00000000-0000-4000-8000-${String(10 + i).padStart(12, "0")}` })),
    operationScopeBindings: graph.operationScopeBindings!.map((b, i) => ({ ...b, id: `00000000-0000-4000-8000-${String(20 + i).padStart(12, "0")}` })),
  };
  const native = compileGraph(persistedGraph);
  const source = { releaseId: "00000000-0000-4000-8000-000000000001", releaseNo: 1, publicationKey: "metadata.reference.test_dictionary", plane: "neon" as const, tenantId: null,
    entityCode: graph.entity.entityCode, sourceEntityId: "00000000-0000-4000-8000-000000000004", sourceReleaseHash: "e".repeat(64), revisionId: "00000000-0000-4000-8000-000000000002", sourceContractHash: native.contractHash, sourceDescriptorHash: native.descriptorHash,
    generatedAt: "2026-09-26T00:00:00.000Z", native: native.descriptor, contract: graph as unknown as Record<string, unknown> };
  const result = compileCompiledEntityArtifacts({ ...lowerNativeRuntimePublication(source, {
    registration: { entityCode: source.entityCode, plane: "neon", storage: { schema: "shared", object: "test_dictionary", idField: "id" }, columns: ["id", "code"] },
    permissions: [{ id: "00000000-0000-4000-8000-000000000003", kind: "capability", code: "common.platform.reference.view", scopeKinds: ["tenant"] }],
  }), registry: { permissions: new Set(["common.platform.reference.view"]), sourceObjects: new Set(["shared.test_dictionary"]), handlers: new Set(), resolvers: new Set(), renderers: new Set(), evaluators: new Set() },
    canonicalizer: { canonicalBytes: value => Buffer.from(JSON.stringify(value)), sha256: bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}` },
  });
  const input = { context: { tenantId: "tenant-a", principalId: "actor-a", planeKey: "neon" }, entityCode: "test_dictionary", recordId: "local-record", kind: "comments", action: "read" } as EntityCapabilityRequest;
  const release = { coordinate: { ...input.context, entityCode: input.entityCode }, release: result.release } as NonNullable<Parameters<ReturnType<typeof createPublishedParentAdmission>>[1]>;
  const reader = { resolve: vi.fn(async () => release),
    artifactByKey: vi.fn(async () => result.artifacts.find(a => a.artifact.artifactType === "runtime_contract")!.artifact),
    publicationCoordinate: vi.fn(async () => ({ releaseId: source.releaseId, releaseNo: 1 })),
  };
  const read = vi.fn(async () => true);
  const admit = createPublishedParentAdmission({ reader: reader as never, read });
  return { input, release, reader, read, admit, core: result.artifacts.find(a => a.artifact.artifactType === "core")!.artifact };
}
it("uses the supplied release for both parent descriptor and capability admission", async () => {
  const f = fixture();
  expect(await f.admit(f.input, f.release)).toEqual({ scopeResources: [{ tenantId: "tenant-a" }] });
  expect(f.reader.resolve).not.toHaveBeenCalled();
  expect(f.reader.artifactByKey).toHaveBeenCalledWith(f.release, "test_dictionary/runtime", "runtime_contract");
  expect(f.read).toHaveBeenCalledWith(f.input, expect.objectContaining({ entityCode: "test_dictionary", planeKey: "neon", storage: expect.objectContaining({ object: "test_dictionary" }) }));
});
it.each(["tenantId", "principalId", "planeKey"])("denies a %s mismatch before reading records", async key => {
  const f = fixture();
  expect(await f.admit({ ...f.input, context: { ...f.input.context, [key]: "other" } }, f.release)).toBe(false);
  expect(f.read).not.toHaveBeenCalled(); expect(f.reader.artifactByKey).not.toHaveBeenCalled();
});
it("does not admit unreadable records or use caller-supplied tenant coordinates", async () => {
  const f = fixture();
  f.read.mockResolvedValue(false); expect(await f.admit(f.input)).toBe(false);
  f.read.mockResolvedValue(true);
  expect(await f.admit({ ...f.input, input: { tenantId: "tenant-b", recordId: "other" } })).toEqual({ scopeResources: [{ tenantId: "tenant-a" }] });
});
it("keeps the same global parent UUID in separate authenticated tenant scopes", async () => {
  const f = fixture();
  const other = { ...f.input, context: { ...f.input.context, tenantId: "tenant-b", principalId: "actor-b" } };
  const otherRelease = { ...f.release, coordinate: { ...f.release.coordinate, tenantId: "tenant-b", principalId: "actor-b" } };
  expect(await f.admit(f.input, f.release)).toEqual({ scopeResources: [{ tenantId: "tenant-a" }] });
  expect(await f.admit(other, otherRelease)).toEqual({ scopeResources: [{ tenantId: "tenant-b" }] });
  expect(f.read.mock.calls.map(([input]) => input.recordId)).toEqual(["local-record", "local-record"]);
});
it("denies an unpublished parent without a native-descriptor fallback", async () => {
  const f = fixture(); f.reader.resolve.mockResolvedValueOnce(null as never);
  expect(await f.admit(f.input)).toBe(false);
  expect(f.read).not.toHaveBeenCalled(); expect(f.reader.artifactByKey).not.toHaveBeenCalled();
});
it("keeps parent admission free of product imports and entity-name branches", () => {
  const text = readFileSync(new URL("../published-parent-admission.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("parent.ts", text, ts.ScriptTarget.Latest, true);
  const allowed = new Set(["@athyper/server-contract-metadata", "@athyper/server-platform-metadata", "@athyper/server-platform-experience"]);
  for (const node of ast.statements) if (ts.isImportDeclaration(node)) expect(allowed.has((node.moduleSpecifier as ts.StringLiteral).text)).toBe(true);
  expect(text).not.toMatch(/country|currency|business_partner|process\.env|sql`/);
});

it("reads a generic header using the exact capability release and only requested fields", async () => {
  const f = fixture();
  const read = vi.fn(async () => ({ id: "local-record", code: "AA", secret: "must not leave provider" }));
  const headers = createPublishedRecordHeader({ reader: f.reader as never, read });
  const input = { context: f.input.context, release: f.release, core: f.core, recordId: f.input.recordId, fieldKeys: ["code"] };
  const first = await headers.readHeader(input);
  expect(first?.values).toEqual({ code: "AA", id: "local-record" });
  expect(first?.revision).toMatch(/^[a-f0-9]{64}$/);
  expect((await headers.readHeader(input))?.revision).toBe(first?.revision);
  expect(f.reader.resolve).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledWith(input, expect.objectContaining({ entityCode: "test_dictionary" }), ["code", "id"]);
  read.mockResolvedValueOnce({ id: "local-record", code: "BB", secret: "different" });
  expect((await headers.readHeader(input))?.revision).not.toBe(first?.revision);
});
it("header reads reject wrong actor, plane, fields and provider record IDs", async () => {
  const f = fixture(); const read = vi.fn(async () => ({ id: "wrong-record", code: "AA" }));
  const headers = createPublishedRecordHeader({ reader: f.reader as never, read });
  const input = { context: f.input.context, release: f.release, core: f.core, recordId: f.input.recordId, fieldKeys: ["code"] };
  await expect(headers.readHeader({ ...input, context: { ...input.context, principalId: "other" } })).rejects.toThrow("SCOPE_MISMATCH");
  await expect(headers.readHeader({ ...input, core: { ...input.core, plane: "mesh" } })).rejects.toThrow("SCOPE_MISMATCH");
  await expect(headers.readHeader({ ...input, fieldKeys: ["secret"] })).rejects.toThrow("FIELD_UNAVAILABLE");
  expect(read).not.toHaveBeenCalled();
  await expect(headers.readHeader(input)).rejects.toThrow("RECORD_MISMATCH");
  read.mockResolvedValueOnce(null as never); expect(await headers.readHeader(input)).toBeNull();
});
it("keeps the header provider free of product, SQL and legacy fallback imports", () => {
  const text = readFileSync(new URL("../published-record-header.ts", import.meta.url), "utf8");
  const allowed = new Set(["node:crypto", "@athyper/server-contract-metadata", "@athyper/server-platform-metadata", "@athyper/server-platform-experience"]);
  for (const node of ts.createSourceFile("header.ts", text, ts.ScriptTarget.Latest, true).statements)
    if (ts.isImportDeclaration(node)) expect(allowed.has((node.moduleSpecifier as ts.StringLiteral).text)).toBe(true);
  expect(text).not.toMatch(/country|currency|business_partner|sql`/);
});
