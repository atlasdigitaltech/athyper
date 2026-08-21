import { describe, expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OutboxEventInput } from "@athyper/server-contract-events";
import { createCollaborationService, createInMemoryCollaborationPersistence } from "../index.js";

const id = { tenant: "11111111-1111-4111-8111-111111111111", author: "22222222-2222-4222-8222-222222222222", mentioned: "33333333-3333-4333-8333-333333333333", comment: "44444444-4444-4444-8444-444444444444", flag: "55555555-5555-4555-8555-555555555555" };

describe("collaboration transaction boundary", () => {
  it("creates comment, resolved mention records, audit, and notification outbox atomically", async () => {
    const events: OutboxEventInput[] = []; const persistence = createInMemoryCollaborationPersistence({ createId: ids(id.comment), now: () => new Date("2026-08-10T00:00:00Z") });
    const service = createCollaborationService({ authorizer: allow(), principals: { resolveActivePrincipals: async (_context, values) => values.filter((value) => value === id.mentioned) }, repository: persistence.repository, transactions: persistence.transactions, outbox: { append: async (event) => { events.push(event); } }, audit: { record: async (input) => ({ ...input, id: "audit-1", occurredAt: "2026-08-10T00:00:00Z", severity: "info" }) } });
    const comment = await service.create({ context: context(), entityType: "content.item", entityId: "article-1", text: "Hello @Ada", mentionedPrincipalIds: [id.mentioned] });
    expect(comment).toMatchObject({ id: id.comment, text: "Hello @Ada", threadDepth: 0 });
    expect(persistence.inspect().mentions.get(id.comment)).toEqual([id.mentioned]);
    expect(events.map((event) => event.eventType)).toEqual(["collaboration.comment.created", "collaboration.comment.mentioned"]);
  });

  it("rolls back the comment when notification outbox persistence fails", async () => {
    const persistence = createInMemoryCollaborationPersistence({ createId: ids(id.comment) }); const service = createCollaborationService({ authorizer: allow(), principals: { resolveActivePrincipals: async (_context, values) => values }, repository: persistence.repository, transactions: persistence.transactions, outbox: { append: async () => { throw new Error("outbox down"); } }, audit: { record: async (input) => ({ ...input, id: "audit", occurredAt: new Date().toISOString(), severity: "info" }) } });
    await expect(service.create({ context: context(), entityType: "content.item", entityId: "article-1", text: "Hello" })).rejects.toThrow("outbox down");
    expect(persistence.inspect().comments.size).toBe(0);
  });

  it("makes reaction PUT idempotent", async () => {
    const persistence = createInMemoryCollaborationPersistence({ createId: ids(id.comment) }); const service = createCollaborationService({ authorizer: allow(), principals: { resolveActivePrincipals: async (_context, values) => values }, repository: persistence.repository, transactions: persistence.transactions, outbox: { append: async () => undefined }, audit: { record: async (input) => ({ ...input, id: "audit", occurredAt: new Date().toISOString(), severity: "info" }) } });
    await service.create({ context: context(), entityType: "content.item", entityId: "article-1", text: "Hello" });
    await expect(service.putReaction({ context: context(), commentId: id.comment, code: "thumbs_up" })).resolves.toBe(true);
    await expect(service.putReaction({ context: context(), commentId: id.comment, code: "thumbs_up" })).resolves.toBe(false);
  });

  it("opens moderation in the same transaction as the comment flag", async () => {
    const persistence = createInMemoryCollaborationPersistence({ createId: ids(id.comment,id.flag) }); let observed=false;
    const service = createCollaborationService({ authorizer: allow(), principals: { resolveActivePrincipals: async (_context, values) => values }, repository: persistence.repository, transactions: persistence.transactions, outbox: { append: async () => undefined }, audit: { record: async (input) => ({ ...input, id: "audit", occurredAt: new Date().toISOString(), severity: "info" }) }, moderation: { open: async (input, transaction) => { observed=transaction!.flags.has(input.commentFlagId); return { id: "66666666-6666-4666-8666-666666666666",tenantId:id.tenant,commentFlagId:id.flag,reviewerEvidence:input.reviewerEvidence??{}, replayed:false, status:"open" }; },review:async()=>{throw new Error("unused")},resolve:async()=>{throw new Error("unused")},dismiss:async()=>{throw new Error("unused")} } });
    await service.create({ context: context(), entityType: "content.item", entityId: "article-1", text: "Hello" });
    await expect(service.flag({ context: context(), commentId:id.comment, reasonCode:"spam" })).resolves.toBe(id.flag);
    expect(observed).toBe(true);
  });

  it("derives safe projections and references from canonical rich text", async () => {
    const events: OutboxEventInput[] = []; const persistence = createInMemoryCollaborationPersistence({ createId: ids(id.comment) });
    const service = createCollaborationService({ authorizer: allow(), principals: { resolveActivePrincipals: async (_context, values) => values }, repository: persistence.repository, transactions: persistence.transactions, outbox: { append: async (event) => { events.push(event); } }, audit: { record: async (input) => ({ ...input, id: "audit", occurredAt: new Date().toISOString(), severity: "info" }) } });
    const result = await service.create({ context: context(), entityType: "content.item", entityId: "article-1", text: "untrusted", format: "rich_json", content: { type: "doc", schema: "athyper.rich-text/1.0", content: [{ type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }, { type: "mention", attrs: { principalId: id.mentioned, label: "Ada" } }] }, { type: "attachmentImage", attrs: { attachmentId: id.flag, alt: "Chart" } }] }, html: "<script>trusted?</script>" });
    expect(result.text).toContain("<script>alert(1)</script>");
    expect(result.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result).toMatchObject({ format: "rich_json", contentSchema: "athyper.rich-text/1.0" });
    expect(persistence.inspect().mentions.get(id.comment)).toEqual([id.mentioned]);
    expect(events.some((event) => event.eventType === "collaboration.comment.mentioned")).toBe(true);
  });

  it("rejects unsafe links and unknown HTML-like nodes", async () => {
    const persistence = createInMemoryCollaborationPersistence({ createId: ids(id.comment) }); const service = createCollaborationService({ authorizer: allow(), principals: { resolveActivePrincipals: async (_context, values) => values }, repository: persistence.repository, transactions: persistence.transactions, outbox: { append: async () => undefined }, audit: { record: async (input) => ({ ...input, id: "audit", occurredAt: new Date().toISOString(), severity: "info" }) } });
    await expect(service.create({ context: context(), entityType: "content.item", entityId: "article-1", text: "x", format: "rich_json", content: { type: "doc", schema: "athyper.rich-text/1.0", content: [{ type: "paragraph", content: [{ type: "text", text: "click", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] } })).rejects.toMatchObject({ code: "INVALID_RICH_TEXT" });
  });
});
function ids(...values: string[]): () => string { let i = 0; return () => values[i++] ?? id.flag; }
function allow() { return { authorize: async () => ({ allowed: true } as const) }; }
function context(): VerifiedRequestContext { return { planeKey: "studio", realmKey: "athyper", tenantId: id.tenant, principalId: id.author, authEpoch: 1, profileHash: "profile", requestId: "request", permissions: { planeKey: "studio", tenantId: id.tenant, principalId: id.author, principalFingerprint: "fp", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } }; }
