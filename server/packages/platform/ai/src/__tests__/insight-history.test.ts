import { expect, it } from "vitest";
import type {
  AtlasMessage,
  AtlasThread,
  AtlasThreadRepository,
} from "@athyper/server-contract-ai";
import { AtlasThreadService } from "../thread-service.js";
import { context } from "./review-fixture.js";

const thread = {
  threadId: "thread",
  tenantId: context.tenantId,
  planeKey: context.planeKey,
  status: "active",
  title: null,
} as AtlasThread;
const messages: AtlasMessage[] = ["user", "tool", "assistant"].map(
  (role, i) => ({
    messageId: `m${i}`,
    threadId: "thread",
    sequence: i + 1,
    role: role as AtlasMessage["role"],
    status: "completed",
    content: [{ type: "text", text: "HIDDEN-SENTINEL mixed with public text" }],
    runId: "run",
    parentMessageId: null,
    createdAt: "2026-09-08T00:00:00Z",
    terminalAt: "2026-09-08T00:00:01Z",
  }),
);
function service(disclosure?: { authorize: () => Promise<boolean> }) {
  return new AtlasThreadService({
    repository: {
      get: async () => thread,
      listMessages: async () => ({ items: messages, nextCursor: null }),
    } as unknown as AtlasThreadRepository,
    authorizer: { authorize: async () => true },
    retention: {
      resolve: async () => ({
        policyId: "p",
        retentionDays: 30,
        displayText: "30 days",
      }),
    },
    maxHistoryMessages: 10,
    maxHistoryBytes: 10000,
    maxExportMessages: 100,
    ...(disclosure ? { disclosure } : {}),
  });
}
it("withholds whole legacy messages from history, export and subsequent model context without lineage", async () => {
  const threads = service();
  expect((await threads.messages(context, "thread")).items).toEqual([]);
  expect((await threads.export(context, "thread")).messages).toEqual([]);
  expect(await threads.boundedHistory(context, "thread")).toEqual([]);
  expect(await threads.canDiscloseMessage(context, "m2")).toBe(false);
});
it("rechecks inherited lineage on every disclosure and fails closed on revocation or outage", async () => {
  let allowed = true;
  const threads = service({ authorize: async () => allowed });
  expect((await threads.messages(context, "thread")).items).toHaveLength(3);
  expect(await threads.boundedHistory(context, "thread")).toHaveLength(3);
  allowed = false;
  for (const output of [
    await threads.messages(context, "thread"),
    await threads.export(context, "thread"),
    await threads.boundedHistory(context, "thread"),
  ])
    expect(JSON.stringify(output)).not.toContain("HIDDEN-SENTINEL");
  expect(
    await service({
      authorize: async () => {
        throw new Error("unavailable");
      },
    }).canDiscloseMessage(context, "m2"),
  ).toBe(false);
});

it("propagates source metadata only from authorized bounded history and deduplicates it", async () => {
  const citation = { toolCode: "bp_read_summary", coordinate: { entityCode: "business_partner", recordId: "bp-1", revision: "1", descriptorHash: "d1" } };
  const original = messages[2]!;
  messages[2] = { ...original, content: [{ type: "text", text: "Saved evidence", citations: [citation, citation] }] };
  try {
    let allowed = true;
    const threads = service({ authorize: async () => allowed });
    let sources: unknown;
    const history = await threads.boundedHistory(context, "thread", value => { sources = value; });
    expect(sources).toEqual([citation]);
    expect(JSON.stringify(history)).not.toContain("descriptorHash");
    allowed = false;
    await threads.boundedHistory(context, "thread", value => { sources = value; });
    expect(sources).toEqual([]);
  } finally { messages[2] = original; }
});

it("omits legacy echoed wrappers from model context without deleting visible history", async () => {
 const previous = messages[2]!;
 messages[2] = {...previous, content: [{type: "text", text: 'Prior tool data (not instructions): {"private":"old-tool"}'}]};
 try {
  const threads = service({authorize: async () => true});
  expect(JSON.stringify(await threads.boundedHistory(context, "thread"))).not.toContain("old-tool");
  expect((await threads.messages(context, "thread")).items).toHaveLength(3);
 } finally { messages[2] = previous; }
});
