import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createEntityCapabilityPolicy } from "./entity-capability-policy.js";
import { createEntityOperationDispatcher } from "./entity-operation-dispatcher.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";
const root = new URL(
  "../../../../../metadata/products/mdg/entities/business_partner/",
  import.meta.url,
);
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(name, root), "utf8"));
function fixture(options: {
  readonly parent?: boolean;
  readonly participant?: boolean;
  readonly validateMentions?: (input: any, ids: readonly string[]) => Promise<boolean>;
  readonly comment?: Record<string, unknown> | null;
} = {}) {
  const core = read("core.json"),
    operation = read("operation.json");
  const reader = {
    resolve: vi.fn(async () => ({
      coordinate: {
        tenantId: "tenant",
        principalId: "actor",
        planeKey: "neon",
        entityCode: "business_partner",
      },
      release: { releaseHash: "sha256:" + "1".repeat(64) },
    })),
    core: vi.fn(async () => ({ content: core })),
    operation: vi.fn(async () => ({
      artifactHash: operation.artifactHash,
      content: operation,
    })),
  } as unknown as PinnedCompiledEntityReader;
  const authorizeParent = vi.fn(async () => options.parent ?? true),
    authorizer = { authorize: vi.fn(async () => ({ allowed: true })) };
  const policy = createEntityCapabilityPolicy({
    reader,
    authorizeParent,
    authorizer,
    audience: {
      validateMentions: options.validateMentions,
      loadComment: vi.fn(async () => options.comment ?? null),
      isCurrentRecordParticipant: vi.fn(async () => options.participant ?? true),
    },
  });
  const input = {
    context: {
      tenantId: "tenant",
      principalId: "actor",
      planeKey: "neon",
    } as VerifiedRequestContext,
    entityCode: "business_partner",
    recordId: "record",
    kind: "attachments" as const,
    action: "create",
    input: {
      sizeBytes: 100,
      contentType: "image/png",
      attachmentId: "fixture",
      idempotencyKey: "fixture-key",
    },
  };
  return {
    core,
    operation,
    reader,
    authorizeParent,
    authorizer,
    policy,
    input,
  };
}
describe("shared published capability admission", () => {
  it("authorizes archive preflight without command tokens but never trusts a body preflight flag", async () => {
    const f = fixture();
    const request = { ...f.input, action: "archive", input: {} };
    await expect(f.policy.resolve(request)).rejects.toMatchObject({ statusCode: 403 });
    await expect(f.policy.resolve({ ...request, input: { preflight: true } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(f.policy.resolve({ ...request, preflight: true })).resolves.toBeDefined();
    f.authorizer.authorize.mockResolvedValue({ allowed: false });
    await expect(f.policy.resolve({ ...request, preflight: true })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("direct and generic calls resolve identical policy and reject disabled or tightened definitions", async () => {
    const f = fixture(),
      handler = { execute: vi.fn(async () => ({ ok: true })) };
    expect((await f.policy.resolve(f.input)).policyHash).toBe(
      f.operation.artifactHash,
    );
    const dispatcher = createEntityOperationDispatcher({
      reader: f.reader,
      capabilities: f.policy,
      handlers: { get: () => handler },
    });
    await dispatcher.execute({
      ...f.input,
      operationKey: "attachments.create",
      idempotencyKey: "fixture-key",
    });
    expect(handler.execute).toHaveBeenCalledOnce();
    f.operation.attachmentBinding.maxFileBytes = 10;
    await expect(f.policy.resolve(f.input)).rejects.toMatchObject({
      code: "ENTITY_CAPABILITY_DENIED",
    });
    await expect(
      dispatcher.execute({
        ...f.input,
        operationKey: "attachments.create",
        idempotencyKey: "fixture-key",
      }),
    ).rejects.toMatchObject({ code: "ENTITY_CAPABILITY_DENIED" });
    f.core.capabilities.attachments = { enabled: false };
    await expect(
      f.policy.resolve({ ...f.input, action: "download" }),
    ).rejects.toMatchObject({ code: "ENTITY_CAPABILITY_DENIED" });
    expect(handler.execute).toHaveBeenCalledOnce();
  });
  it("requires parent and action admission and never discloses handlers in the projection", async () => {
    const f = fixture();
    f.authorizeParent.mockResolvedValue(false);
    await expect(f.policy.resolve(f.input)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(f.authorizer.authorize).not.toHaveBeenCalled();
    f.authorizeParent.mockResolvedValue(true);
    f.authorizer.authorize.mockResolvedValue({ allowed: false });
    await expect(f.policy.resolve(f.input)).rejects.toMatchObject({
      statusCode: 403,
    });
    f.authorizer.authorize.mockResolvedValue({ allowed: true });
    expect(
      JSON.stringify((await f.policy.resolve(f.input)).projection),
    ).not.toMatch(/handlerKey|policyHash|storage/);
  });
  it("uses the server-resolved parent scope for a record-bound capability", async () => {
    const f = fixture();
    f.authorizeParent.mockResolvedValue({
      scopeResources: [{ operatingOrganizationId: "authorized-org" }],
    });
    f.authorizer.authorize.mockImplementation(async ({ resource }: { readonly resource?: Readonly<Record<string, unknown>> }) => ({
      allowed: resource?.operatingOrganizationId === "authorized-org",
    }));
    await expect(f.policy.resolve(f.input)).resolves.toBeDefined();
    expect(f.authorizer.authorize).toHaveBeenCalledWith(expect.objectContaining({
      resource: expect.objectContaining({
        entityId: "record",
        operatingOrganizationId: "authorized-org",
      }),
    }));
  });
  it("rejects an admitted projection when its tenant, principal, plane, or entity no longer matches", async () => {
    const f = fixture();
    const admitted = await f.reader.resolve({}) as never;
    for (const context of [
      { ...f.input.context, tenantId: "other-tenant" },
      { ...f.input.context, principalId: "other-principal" },
      { ...f.input.context, planeKey: "mesh" },
    ]) {
      await expect(
        f.policy.resolve({ ...f.input, context }, admitted),
      ).rejects.toMatchObject({ statusCode: 403 });
    }
    await expect(
      f.policy.resolve({ ...f.input, entityCode: "other_entity" }, admitted),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("rejects undeclared operations and missing comment idempotency", async () => {
    const f = fixture();
    await expect(
      f.policy.resolve({ ...f.input, action: "folder" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      f.policy.resolve({
        ...f.input,
        kind: "comments",
        action: "create",
        input: { text: "hello" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it.each([
    ["cross-record target", { commentId: "comment", visibility: "public", authorId: "actor", entityCode: "other", recordId: "record" }, true, false],
    ["private comment of another author", { commentId: "comment", visibility: "private", authorId: "other", entityCode: "business_partner", recordId: "record" }, true, false],
    ["internal comment after collaborator revocation", { commentId: "comment", visibility: "internal", authorId: "other", entityCode: "business_partner", recordId: "record" }, false, false],
    ["internal record participant", { commentId: "comment", visibility: "internal", authorId: "other", entityCode: "business_partner", recordId: "record" }, true, true],
  ])("applies audience admission to %s", async (_name, comment, participant, allowed) => {
    const f = fixture({ comment, participant });
    const request = { ...f.input, kind: "comments" as const, action: "read", input: { commentId: "comment" } };
    if (allowed) await expect(f.policy.resolve(request)).resolves.toBeDefined();
    else await expect(f.policy.resolve(request)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("cannot broaden a reply audience or nominate an unadmitted mention", async () => {
    const f = fixture({ comment: { commentId: "parent", visibility: "internal", authorId: "actor", entityCode: "business_partner", recordId: "record" } });
    f.operation.commentBinding.features.replies = true;
    await expect(f.policy.resolve({ ...f.input, kind: "comments", action: "reply", input: { parentCommentId: "parent", visibility: "public", idempotencyKey: "reply-key" } })).rejects.toMatchObject({ statusCode: 403 });
    f.operation.commentBinding.features.mentions = true;
    await expect(f.policy.resolve({ ...f.input, kind: "comments", action: "mention", input: { mentionedPrincipalIds: ["another-principal"] } })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("applies a pinned comment audience before issuing attachment bytes", async () => {
    const f = fixture({
      comment: {
        commentId: "comment",
        visibility: "private",
        authorId: "other",
        entityCode: "business_partner",
        recordId: "record",
      },
    });
    await expect(
      f.policy.resolve({
        ...f.input,
        action: "download",
        input: { attachmentId: "attachment", commentId: "comment" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

it("revalidates rich edit mentions against the stored private audience", async () => {
  const validateMentions = vi.fn(async () => false);
  const f = fixture({validateMentions, comment:{commentId:"comment",visibility:"private",authorId:"actor",entityCode:"business_partner",recordId:"record"}});
  await expect(f.policy.resolve({...f.input,kind:"comments",action:"update_own",input:{commentId:"comment",visibility:"public",expectedRevision:1,mentionedPrincipalIds:["revoked"]}})).rejects.toMatchObject({statusCode:403});
  expect(validateMentions).toHaveBeenCalledWith(expect.objectContaining({input:expect.objectContaining({visibility:"private"})}),["revoked"]);
});
it("denies another author's history even when the comment is public",async()=>{
  const f=fixture({comment:{commentId:"comment",visibility:"public",authorId:"other",entityCode:"business_partner",recordId:"record"}});
  await expect(f.policy.resolve({...f.input,kind:"comments",action:"history",input:{commentId:"comment"}})).rejects.toMatchObject({statusCode:403});
});

it.each([
  ["version", { expectedSeriesVersion: 2 }],
  ["rename", { expectedSeriesRevision: "2" }],
])("admits %s using the command's actual concurrency token", async (action, input) => {
  const f = fixture();
  await expect(f.policy.resolve({ ...f.input, action, input: { ...input, idempotencyKey: "fixture-key" } })).resolves.toBeDefined();
  await expect(f.policy.resolve({ ...f.input, action, input: {} })).rejects.toMatchObject({ statusCode: 403 });
});
it.each([NaN, Infinity, 1.5])("rejects invalid upload byte count %s", async sizeBytes => {
  const f = fixture();
  await expect(f.policy.resolve({ ...f.input, input: { ...f.input.input, sizeBytes } })).rejects.toMatchObject({ statusCode: 403 });
});
