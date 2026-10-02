import { expect, it } from "vitest";
import { atlasEvidenceHash, AtlasDurableMessageAuthorizer, createAtlasMessageLineage, type AtlasLineageMessage } from "./message-lineage.js";
import { context as base } from "./__tests__/review-fixture.js";

function harness() {
  const context = { ...base, permissions: { ...base.permissions, allowed: ["neon.ai.agent.use"] } };
  const page = { schemaVersion: 1, kind: "record", entityCode: "country", recordId: "country-id", generationId: "generation", locale: "en", dirty: false } as const;
  const business = { page, descriptorHash: "descriptor", scopeFingerprint: "scope" };
  const evidence = { toolCode: "entity_read_record", toolVersion: "1", arguments: { recordId: "country-id" }, policyRevision: "policy", resultHash: "result" };
  const content = [{ type: "text", text: "Authorized summary" }] as const;
  const rows = new Map<string, AtlasLineageMessage>(Array.from({ length: 6 }, (_, i) => [`m${i}`, {
    messageId: `m${i}`, threadId: "thread", sequence: i + 1, content,
    lineage: createAtlasMessageLineage(context, content, i ? `m${i-1}` : null, {
      schemaVersion: 1, businessContext: page, businessContextHash: atlasEvidenceHash(business),
      attachments: { attachmentContextId: "a", attachmentIds: ["file"], dataClass: "synthetic", resultHash: atlasEvidenceHash([]) },
    }, [evidence]),
  }]));
  const calls = { reader: 0, context: 0, reads: 0, attachments: 0 };
  let revoked = false;
  const authorizer = new AtlasDurableMessageAuthorizer({
    reader: { read: async (_context, id) => { calls.reader++; return rows.get(id) ?? null; } },
    businessContexts: { resolve: async () => { calls.context++; return business; } },
    reads: { revalidate: async () => { calls.reads++; return !revoked; } },
    attachments: { resolve: async () => { calls.attachments++; return []; } },
  });
  const request = { context, messageIds: [...rows.keys()] };
  return { authorizer, request, calls, rows, revoke: () => { revoked = true; } };
}
it("reuses exact owner dependencies within a history request and rechecks revocation next request", async () => {
  const h = harness();
  expect(await h.authorizer.authorizeMany(h.request)).toEqual(Array(6).fill(true));
  expect(h.calls).toEqual({ reader: 6, context: 1, reads: 1, attachments: 1 });
  h.revoke();
  expect(await h.authorizer.authorizeMany(h.request)).toEqual(Array(6).fill(false));
  expect(h.calls).toEqual({ reader: 12, context: 2, reads: 2, attachments: 2 });
});
it("never lets reused ancestors bypass content integrity or inherited denial", async () => {
  const h = harness();
  const row = h.rows.get("m1")!;
  h.rows.set("m1", { ...row, content: [{ type: "text", text: "Changed outside evidence" }] });
  expect(await h.authorizer.authorizeMany(h.request)).toEqual([true, false, false, false, false, false]);
});
it("does not reuse a previous principal's authorization or ignore missing ancestry", async () => {
  const h = harness();
  expect(await h.authorizer.authorizeMany(h.request)).toEqual(Array(6).fill(true));
  expect(await h.authorizer.authorizeMany({ ...h.request, context: { ...h.request.context, authEpoch: 2 } })).toEqual(Array(6).fill(false));
  h.rows.delete("m0");
  expect(await h.authorizer.authorizeMany(h.request)).toEqual(Array(6).fill(false));
});

it("does not fan out independent lineage reads into the owner connection pool", async () => {
  const h = harness();
  let active = 0, maximum = 0;
  const authorizer = new AtlasDurableMessageAuthorizer({
    reader: { read: async (_context, id) => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      const row = h.rows.get(id)!;
      return { ...row, lineage: { ...row.lineage!, input: { schemaVersion: 1 }, reads: [] } };
    } },
  });
  expect(await authorizer.authorizeMany(h.request)).toEqual(Array(6).fill(true));
  expect(maximum).toBe(1);
});
