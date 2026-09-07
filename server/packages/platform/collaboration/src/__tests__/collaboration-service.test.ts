import { describe, expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OutboxEventInput } from "@athyper/server-contract-events";
import {
  createCollaborationService,
  createInMemoryCollaborationPersistence,
} from "../index.js";

const id = {
  tenant: "11111111-1111-4111-8111-111111111111",
  author: "22222222-2222-4222-8222-222222222222",
  mentioned: "33333333-3333-4333-8333-333333333333",
  comment: "44444444-4444-4444-8444-444444444444",
  flag: "55555555-5555-4555-8555-555555555555",
};

describe("collaboration transaction boundary", () => {
  it("creates comment, resolved mention records, audit, and notification outbox atomically", async () => {
    const events: OutboxEventInput[] = [];
    const persistence = createInMemoryCollaborationPersistence({
      createId: ids(id.comment),
      now: () => new Date("2026-08-10T00:00:00Z"),
    });
    const service = createCollaborationService({
      authorizer: allow(),
      principals: {
        resolveActivePrincipals: async (_context, values) =>
          values.filter((value) => value === id.mentioned),
      },
      repository: persistence.repository,
      commandExecutions: persistence.commandExecutions,
      transactions: persistence.transactions,
      outbox: {
        append: async (event) => {
          events.push(event);
        },
      },
      audit: {
        record: async (input) => ({
          ...input,
          id: "audit-1",
          occurredAt: "2026-08-10T00:00:00Z",
          severity: "info",
        }),
      },
    });
    const comment = await service.create({
      context: context(),
      entityType: "content.item",
      entityId: "article-1",
      text: "Hello @Ada",
      mentionedPrincipalIds: [id.mentioned],
    });
    expect(comment).toMatchObject({
      id: id.comment,
      text: "Hello @Ada",
      threadDepth: 0,
    });
    expect(persistence.inspect().mentions.get(id.comment)).toEqual([
      id.mentioned,
    ]);
    expect(events.map((event) => event.eventType)).toEqual([
      "collaboration.comment.created",
      "collaboration.comment.mentioned",
    ]);
  });

  it("rolls back the comment when notification outbox persistence fails", async () => {
    const persistence = createInMemoryCollaborationPersistence({
      createId: ids(id.comment),
    });
    const service = createCollaborationService({
      authorizer: allow(),
      principals: {
        resolveActivePrincipals: async (_context, values) => values,
      },
      repository: persistence.repository,
      commandExecutions: persistence.commandExecutions,
      transactions: persistence.transactions,
      outbox: {
        append: async () => {
          throw new Error("outbox down");
        },
      },
      audit: {
        record: async (input) => ({
          ...input,
          id: "audit",
          occurredAt: new Date().toISOString(),
          severity: "info",
        }),
      },
    });
    await expect(
      service.create({
        context: context(),
        entityType: "content.item",
        entityId: "article-1",
        text: "Hello",
      }),
    ).rejects.toThrow("outbox down");
    expect(persistence.inspect().comments.size).toBe(0);
  });

  it("makes reaction PUT idempotent", async () => {
    const persistence = createInMemoryCollaborationPersistence({
      createId: ids(id.comment),
    });
    const service = createCollaborationService({
      authorizer: allow(),
      principals: {
        resolveActivePrincipals: async (_context, values) => values,
      },
      repository: persistence.repository,
      commandExecutions: persistence.commandExecutions,
      transactions: persistence.transactions,
      outbox: { append: async () => undefined },
      audit: {
        record: async (input) => ({
          ...input,
          id: "audit",
          occurredAt: new Date().toISOString(),
          severity: "info",
        }),
      },
    });
    await service.create({
      context: context(),
      entityType: "content.item",
      entityId: "article-1",
      text: "Hello",
    });
    await expect(
      service.putReaction({
        context: context(),
        commentId: id.comment,
        code: "thumbs_up",
      }),
    ).resolves.toBe(true);
    await expect(
      service.putReaction({
        context: context(),
        commentId: id.comment,
        code: "thumbs_up",
      }),
    ).resolves.toBe(false);
  });

  it("opens moderation in the same transaction as the comment flag", async () => {
    const persistence = createInMemoryCollaborationPersistence({
      createId: ids(id.comment, id.flag),
    });
    let observed = false;
    const service = createCollaborationService({
      authorizer: allow(),
      principals: {
        resolveActivePrincipals: async (_context, values) => values,
      },
      repository: persistence.repository,
      commandExecutions: persistence.commandExecutions,
      transactions: persistence.transactions,
      outbox: { append: async () => undefined },
      audit: {
        record: async (input) => ({
          ...input,
          id: "audit",
          occurredAt: new Date().toISOString(),
          severity: "info",
        }),
      },
      moderation: {
        open: async (input, transaction) => {
          observed = transaction!.flags.has(input.commentFlagId);
          return {
            id: "66666666-6666-4666-8666-666666666666",
            tenantId: id.tenant,
            commentFlagId: id.flag,
            reviewerEvidence: input.reviewerEvidence ?? {},
            replayed: false,
            status: "open",
          };
        },
        review: async () => {
          throw new Error("unused");
        },
        resolve: async () => {
          throw new Error("unused");
        },
        dismiss: async () => {
          throw new Error("unused");
        },
      },
    });
    await service.create({
      context: context(),
      entityType: "content.item",
      entityId: "article-1",
      text: "Hello",
    });
    await expect(
      service.flag({
        context: context(),
        commentId: id.comment,
        reasonCode: "spam",
      }),
    ).resolves.toBe(id.flag);
    expect(observed).toBe(true);
  });

  it("derives safe projections and references from canonical rich text", async () => {
    const events: OutboxEventInput[] = [];
    const persistence = createInMemoryCollaborationPersistence({
      createId: ids(id.comment),
    });
    const service = createCollaborationService({
      authorizer: allow(),
      principals: {
        resolveActivePrincipals: async (_context, values) => values,
      },
      repository: persistence.repository,
      commandExecutions: persistence.commandExecutions,
      transactions: persistence.transactions,
      outbox: {
        append: async (event) => {
          events.push(event);
        },
      },
      audit: {
        record: async (input) => ({
          ...input,
          id: "audit",
          occurredAt: new Date().toISOString(),
          severity: "info",
        }),
      },
    });
    const result = await service.create({
      context: context(),
      entityType: "content.item",
      entityId: "article-1",
      text: "untrusted",
      format: "rich_json",
      content: {
        type: "doc",
        schema: "athyper.rich-text/1.0",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "<script>alert(1)</script>" },
              {
                type: "mention",
                attrs: { principalId: id.mentioned, label: "Ada" },
              },
            ],
          },
          {
            type: "attachmentImage",
            attrs: { attachmentId: id.flag, alt: "Chart" },
          },
        ],
      },
      html: "<script>trusted?</script>",
    });
    expect(result.text).toContain("<script>alert(1)</script>");
    expect(result.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result).toMatchObject({
      format: "rich_json",
      contentSchema: "athyper.rich-text/1.0",
    });
    expect(persistence.inspect().mentions.get(id.comment)).toEqual([
      id.mentioned,
    ]);
    expect(
      events.some(
        (event) => event.eventType === "collaboration.comment.mentioned",
      ),
    ).toBe(true);
  });

  it("rejects unsafe links and unknown HTML-like nodes", async () => {
    const persistence = createInMemoryCollaborationPersistence({
      createId: ids(id.comment),
    });
    const service = createCollaborationService({
      authorizer: allow(),
      principals: {
        resolveActivePrincipals: async (_context, values) => values,
      },
      repository: persistence.repository,
      commandExecutions: persistence.commandExecutions,
      transactions: persistence.transactions,
      outbox: { append: async () => undefined },
      audit: {
        record: async (input) => ({
          ...input,
          id: "audit",
          occurredAt: new Date().toISOString(),
          severity: "info",
        }),
      },
    });
    await expect(
      service.create({
        context: context(),
        entityType: "content.item",
        entityId: "article-1",
        text: "x",
        format: "rich_json",
        content: {
          type: "doc",
          schema: "athyper.rich-text/1.0",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "click",
                  marks: [
                    { type: "link", attrs: { href: "javascript:alert(1)" } },
                  ],
                },
              ],
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_RICH_TEXT" });
  });
});
function ids(...values: string[]): () => string {
  let i = 0;
  return () => values[i++] ?? id.flag;
}
function allow() {
  return { authorize: async () => ({ allowed: true }) as const };
}
function context(): VerifiedRequestContext {
  return {
    planeKey: "studio",
    realmKey: "athyper",
    tenantId: id.tenant,
    principalId: id.author,
    authEpoch: 1,
    profileHash: "profile",
    requestId: "request",
    permissions: {
      planeKey: "studio",
      tenantId: id.tenant,
      principalId: id.author,
      principalFingerprint: "fp",
      profileHash: "profile",
      schemaHash: "schema",
      resolvedAt: 1,
      allowed: [],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      entries: [],
      authorizationScopes: [],
    },
  };
}

function harness(options: { failOutbox?: () => boolean; deny?: boolean } = {}) {
  const events: OutboxEventInput[] = [];
  const persistence = createInMemoryCollaborationPersistence({
    now: () => new Date("2026-08-10T00:00:00Z"),
  });
  const service = createCollaborationService({
    authorizer: { authorize: async () => ({ allowed: !options.deny }) },
    principals: { resolveActivePrincipals: async (_context, values) => values },
    repository: persistence.repository,
    commandExecutions: persistence.commandExecutions,
    transactions: persistence.transactions,
    outbox: {
      append: async (event) => {
        if (options.failOutbox?.()) throw new Error("outbox down");
        events.push(event);
      },
    },
    audit: {
      record: async (input) => ({
        ...input,
        id: "audit",
        occurredAt: new Date().toISOString(),
        severity: "info",
      }),
    },
  });
  return { persistence, service, events };
}
const base = {
  context: context(),
  entityType: "content.item",
  entityId: "article-1",
  text: "hello",
};
describe("collaboration regression coverage", () => {
  it("normalizes equivalent edit timestamps and accepts createdAt for the first edit", async () => {
    const { service } = harness();
    const comment = await service.create(base);
    await expect(
      service.edit({
        context: context(),
        commentId: comment.id,
        text: "edited",
        expectedUpdatedAt: "2026-08-10T08:00:00+08:00",
      }),
    ).resolves.toMatchObject({ text: "edited" });
    await expect(
      service.edit({
        context: context(),
        commentId: comment.id,
        text: "stale",
        expectedUpdatedAt: "2026-08-09T00:00:00Z",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it.each(["garbage", "infinity", "2026-08-10", "2026-08-10T00:00:00"])(
    "rejects invalid timestamps %s",
    async (readAt) => {
      const { service, persistence } = harness();
      await expect(service.markRead({ ...base, readAt })).rejects.toMatchObject(
        { code: "INVALID_TIMESTAMP" },
      );
      expect(persistence.inspect().cursors.size).toBe(0);
    },
  );
  it("never moves a read cursor backwards", async () => {
    const { service, persistence } = harness();
    await service.markRead({ ...base, readAt: "2026-08-10T00:00:00Z" });
    await service.markRead({ ...base, readAt: "2026-08-09T00:00:00Z" });
    expect([...persistence.inspect().cursors.values()]).toEqual([
      "2026-08-10T00:00:00.000Z",
    ]);
  });
  it("returns controlled errors for absent and mismatched reply parents and excessive depth", async () => {
    const { service } = harness();
    await expect(
      service.create({ ...base, parentCommentId: id.comment }),
    ).rejects.toMatchObject({ statusCode: 404 });
    let parent = await service.create(base);
    await expect(
      service.create({
        ...base,
        contextType: "workflow",
        parentCommentId: parent.id,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    for (let depth = 1; depth <= 5; depth++)
      parent = await service.create({ ...base, parentCommentId: parent.id });
    await expect(
      service.create({ ...base, parentCommentId: parent.id }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
  it("clears all rich projections when converting to plain text", async () => {
    const { service } = harness();
    const comment = await service.create({
      ...base,
      format: "rich_json",
      content: {
        type: "doc",
        schema: "athyper.rich-text/1.0",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "rich" }] },
        ],
      },
    });
    const edited = await service.edit({
      context: context(),
      commentId: comment.id,
      text: "plain",
      contentSchema: "athyper.rich-text/9.9",
    });
    expect(edited.format).toBe("plain");
    expect(edited.content).toBeUndefined();
    expect(edited.html).toBeUndefined();
    expect(edited.contentSchema).toBeUndefined();
  });
  it("rejects reactions and flags against missing or other-tenant comments", async () => {
    const { service } = harness();
    const comment = await service.create(base);
    for (const commentId of [id.comment, comment.id]) {
      const other = { ...context(), tenantId: id.mentioned };
      await expect(
        service.putReaction({ context: other, commentId, code: "thumbs_up" }),
      ).resolves.toBe(false);
      await expect(
        service.flag({ context: other, commentId, reasonCode: "spam" }),
      ).rejects.toMatchObject({ statusCode: 404 });
    }
  });
  it("reuses an open flag for repeated reports", async () => {
    const { service, persistence } = harness();
    const comment = await service.create(base);
    const input = {
      context: context(),
      commentId: comment.id,
      reasonCode: "spam",
    };
    expect(await service.flag(input)).toBe(
      await service.flag({ ...input, reasonCode: "abuse" }),
    );
    expect(persistence.inspect().flags.size).toBe(1);
  });
  it.each([
    null,
    { type: "text", text: "hello", marks: {} },
    { type: "text", text: "hello", marks: [null] },
  ])("rejects malformed rich-text nodes", async (node) => {
    const { service } = harness();
    await expect(
      service.create({
        ...base,
        format: "rich_json",
        content: {
          type: "doc",
          schema: "athyper.rich-text/1.0",
          content: [{ type: "paragraph", content: [node] }],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_RICH_TEXT" });
  });
});

describe("comment create idempotency", () => {
  it("replays concurrent retries and rejects a changed request or actor", async () => {
    const { service, persistence } = harness();
    const command = { ...base, idempotencyKey: "collaboration-create-0001" };
    const [first, second] = await Promise.all([
      service.create(command),
      service.create({
        ...command,
        context: { ...context(), requestId: "retry" },
      }),
    ]);
    expect(second).toEqual(first);
    expect(persistence.inspect().comments.size).toBe(1);
    await expect(
      service.create({ ...command, text: "different" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service.create({
        ...command,
        context: { ...context(), principalId: id.mentioned },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("rejects malformed keys before inserting", async () => {
    const { service, persistence } = harness();
    await expect(
      service.create({ ...base, idempotencyKey: "bad" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(persistence.inspect().comments.size).toBe(0);
  });
});

describe("collaboration side-effect regressions", () => {
  it("rolls back the receipt on failure and emits side effects only on the successful attempt", async () => {
    let fail = true;
    const { service, persistence, events } = harness({
      failOutbox: () => fail,
    });
    const command = { ...base, idempotencyKey: "collaboration-create-0002" };
    await expect(service.create(command)).rejects.toThrow("outbox down");
    expect(persistence.inspect().receipts.size).toBe(0);
    expect(persistence.inspect().comments.size).toBe(0);
    fail = false;
    const first = await service.create(command);
    expect(await service.create(command)).toEqual(first);
    expect(events).toHaveLength(1);
  });
  it("does not reuse a deduplication key across successive mention edits", async () => {
    const { service, events } = harness();
    const comment = await service.create(base);
    for (const text of ["first mention", "second mention"])
      await service.edit({
        context: context(),
        commentId: comment.id,
        text,
        mentionedPrincipalIds: [id.mentioned],
      });
    const mentions = events.filter(
      (event) => event.eventType === "collaboration.comment.mentioned",
    );
    expect(mentions).toHaveLength(2);
    expect(mentions.every((event) => event.eventKey === undefined)).toBe(true);
  });
  it("caps future read times and rejects impossible calendar dates", async () => {
    const { service, persistence } = harness();
    const before = Date.now();
    await service.markRead({ ...base, readAt: "2099-01-01T00:00:00Z" });
    const cursor = [...persistence.inspect().cursors.values()][0]!;
    expect(Date.parse(cursor)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(cursor)).toBeLessThanOrEqual(Date.now());
    await expect(
      service.markRead({ ...base, readAt: "2026-02-30T00:00:00Z" }),
    ).rejects.toMatchObject({ code: "INVALID_TIMESTAMP" });
  });
});

it("uses a UUID outbox entity for mentions on resources with text IDs", async () => {
  const { service, events } = harness();
  const comment = await service.create({
    ...base,
    mentionedPrincipalIds: [id.mentioned],
  });
  expect(
    events.find(
      (event) => event.eventType === "collaboration.comment.mentioned",
    ),
  ).toMatchObject({
    entityType: "document.comment",
    entityId: comment.id,
    payload: { entity_type: "content.item", entity_id: "article-1" },
  });
});
it("accepts flag reason codes supported by the database", async () => {
  const { service } = harness();
  const comment = await service.create(base);
  await expect(
    service.flag({
      context: context(),
      commentId: comment.id,
      reasonCode: "policy.abuse-report",
    }),
  ).resolves.toBeTypeOf("string");
});

it.each([
  "create",
  "edit",
  "remove",
  "putReaction",
  "deleteReaction",
  "putDraft",
  "deleteDraft",
  "markRead",
  "flag",
] as const)("denies %s without mutation permission", async (method) => {
  const { service, persistence } = harness({ deny: true });
  await expect(
    service[method]({
      ...base,
      commentId: id.comment,
      code: "thumbs_up",
      reasonCode: "spam",
    } as never),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(persistence.inspect().comments.size).toBe(0);
  expect(persistence.inspect().flags.size).toBe(0);
  expect(persistence.inspect().drafts.size).toBe(0);
  expect(persistence.inspect().cursors.size).toBe(0);
});
it("preserves author ownership for edit and delete", async () => {
  const { service } = harness();
  const comment = await service.create(base);
  const other = { ...context(), principalId: id.mentioned };
  await expect(
    service.edit({
      context: other,
      commentId: comment.id,
      text: "unauthorized edit",
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    service.remove({ context: other, commentId: comment.id }),
  ).resolves.toBe(false);
});
