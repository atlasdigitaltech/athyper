import { expect, it } from "vitest";
import type {
  AtlasThreadRepository,
  AtlasMessage,
} from "@athyper/server-contract-ai";
import { AtlasThreadService } from "./thread-service.js";
import { context } from "./__tests__/review-fixture.js";
it("bounds fresh disclosure concurrency, preserves order and rechecks revocation", async () => {
  let active = 0,
    peak = 0,
    revoked = false;
  const seen: string[] = [];
  const messages = Array.from(
    { length: 9 },
    (_, i) => ({ messageId: `m${i}` }) as AtlasMessage,
  );
  const service = new AtlasThreadService({
    repository: {
      get: async () => ({
        tenantId: context.tenantId,
        planeKey: context.planeKey,
      }),
      listMessages: async () => ({ items: messages, nextCursor: null }),
    } as unknown as AtlasThreadRepository,
    authorizer: { authorize: async () => true },
    retention: {} as never,
    maxHistoryMessages: 10,
    maxHistoryBytes: 1000,
    maxExportMessages: 10,
    disclosure: {
      authorize: async ({ messageId }) => {
        active++;
        peak = Math.max(peak, active);
        seen.push(messageId);
        try {
          await new Promise((resolve) =>
            setTimeout(resolve, messageId === "m0" ? 5 : 1),
          );
          if (messageId === "m2") throw Error("Owner unavailable");
          return !revoked && messageId !== "m1";
        } finally {
          active--;
        }
      },
    },
  });
  expect(
    (await service.messages(context, "thread")).items.map((m) => m.messageId),
  ).toEqual(["m0", "m3", "m4", "m5", "m6", "m7", "m8"]);
  expect(peak).toBe(4);
  expect(seen).toHaveLength(9);
  revoked = true;
  expect((await service.messages(context, "thread")).items).toEqual([]);
  expect(seen).toHaveLength(18);
});
