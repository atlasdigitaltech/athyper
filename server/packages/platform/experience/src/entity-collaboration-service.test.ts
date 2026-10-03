import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";
import { createEntityCapabilityPolicy } from "./entity-capability-policy.js";
import { createEntityCollaborationService } from "./entity-collaboration-service.js";
import ts from "typescript";

function fixture() {
  // Reuse validated metadata as test data, not runtime entity dispatch logic.
  const definitions = JSON.parse(readFileSync(new URL("../../../../../metadata/entities/country/capabilities.json", import.meta.url), "utf8"));
  const context = { tenantId: "tenant-a", principalId: "actor-a", planeKey: "neon", permissions: { allowed: [] } } as unknown as VerifiedRequestContext;
  const subject = { context, entityCode: "country", recordId: "record-a" };
  const coordinate = { tenantId: context.tenantId, principalId: context.principalId, planeKey: context.planeKey, entityCode: subject.entityCode };
  const release = { coordinate, release: { releaseId: "release-a", releaseHash: "a".repeat(64) } };
  const core = { entityCode: subject.entityCode, content: { capabilities: Object.fromEntries(definitions.map((d: any) => [d.capabilityKey, d.declaration])) } };
  const reader = { resolve: vi.fn(async () => release), core: vi.fn(async () => core), operation: vi.fn(async () => ({ artifactHash: "b".repeat(64), content: { commentBinding: definitions[0].binding, attachmentBinding: definitions[1].binding } })) } as unknown as PinnedCompiledEntityReader;
  const authorizer = { authorize: vi.fn(async (_input: any) => ({ allowed: true })) };
  const parent = vi.fn(async () => true);
  const capabilities = createEntityCapabilityPolicy({ reader, authorizer: authorizer as never, authorizeParent: parent });
  const read = vi.fn(async (_input: any) => ({ revision: "1", data: { items: [] } }));
  const providers = { getService: vi.fn((_key: string) => ({ read })) };
  return { subject, coordinate, core, reader, authorizer, parent, read, providers, service: createEntityCollaborationService({ reader, capabilities, providers }) };
}
describe("record collaboration without fabricated section artifacts", () => {
  it("keeps the service inside explicit generic package boundaries", () => {
    const source = readFileSync(new URL("./entity-collaboration-service.ts", import.meta.url), "utf8");
    const ast = ts.createSourceFile("service.ts", source, ts.ScriptTarget.Latest, true);
    const allowed = new Set(["@athyper/server-contract-auth", "@athyper/server-platform-metadata", "./entity-capability-policy.js", "./entity-section-service.js"]);
    function walk(node: ts.Node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) expect(allowed.has(node.moduleSpecifier.text)).toBe(true);
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require")) throw Error("Dynamic dependencies are not permitted");
      ts.forEachChild(node, walk);
    }
    walk(ast);
  });
  it("describes only authorized signed capabilities and returns safe projection", async () => {
    const f = fixture();
    expect(await f.service.describe(f.subject)).toEqual(["comments", "attachments"]);
    const result = await f.service.read({ ...f.subject, kind: "comments" });
    expect(result.presentation.rendererKey).toBe("platform.comments.v1");
    expect(result.capability.actions.map(a => a.key)).toContain("create");
    expect(JSON.stringify(result)).not.toContain("permissionCode");
    expect(f.read.mock.calls[0]![0]).not.toHaveProperty("section");
    expect(f.read.mock.calls[0]![0].context).toBe(f.subject.context);
  });
  it("retains individual action permission filtering", async () => {
    const f = fixture();
    f.authorizer.authorize.mockImplementation(async input => ({ allowed: input.permissionCode.endsWith(".read") }));
    const result = await f.service.read({ ...f.subject, kind: "attachments" });
    expect(result.capability.actions.map(a => a.key)).toEqual(["read", "status", "extract", "search"]);
    expect(result.capability.actions.map(a => a.key)).not.toContain("preview");
  });
  it("omits undeclared capabilities without breaking ordinary detail pages", async () => {
    const f = fixture(); f.core.content.capabilities = {};
    expect(await f.service.describe(f.subject)).toEqual([]);
    expect(f.read).not.toHaveBeenCalled();
  });
  it("denies parent access before reading collaboration rows", async () => {
    const f = fixture(); f.parent.mockResolvedValue(false);
    expect(await f.service.describe(f.subject)).toEqual([]);
    await expect(f.service.read({ ...f.subject, kind: "comments" })).rejects.toThrow("unavailable or not authorized");
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each(["tenantId", "principalId", "planeKey"])("rejects pinned release %s mismatch", async field => {
    const f = fixture(); (f.coordinate as Record<string, unknown>)[field] = "other";
    await expect(f.service.read({ ...f.subject, kind: "attachments" })).rejects.toThrow("unavailable or not authorized");
    expect(f.read).not.toHaveBeenCalled();
  });
  it("does not expose unavailable providers or swallow infrastructure errors", async () => {
    const f = fixture(); f.providers.getService.mockReturnValue(undefined as never);
    expect(await f.service.describe(f.subject)).toEqual([]);
    await expect(f.service.read({ ...f.subject, kind: "comments" })).rejects.toThrow("ENTITY_RUNTIME_SECTION_HANDLER_UNAVAILABLE");
    f.parent.mockRejectedValue(new Error("database unavailable"));
    await expect(f.service.describe(f.subject)).rejects.toThrow("database unavailable");
  });
  it("rechecks permissions on every read after descriptor discovery", async () => {
    const f = fixture();
    expect(await f.service.describe(f.subject)).toContain("comments");
    f.authorizer.authorize.mockResolvedValue({ allowed: false });
    await expect(f.service.read({ ...f.subject, kind: "comments" })).rejects.toThrow("unavailable or not authorized");
    expect(f.read).not.toHaveBeenCalled();
  });
  it("requires subject admission for thread reads", async () => {
    const f = fixture();
    await expect(f.service.read({ ...f.subject, kind: "comments", threadRootId: "11111111-1111-4111-8111-111111111111" })).rejects.toThrow("unavailable or not authorized");
    expect(f.read).not.toHaveBeenCalled();
  });
});
