import { expect, it, vi } from "vitest";
import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { createEntityNotificationDeliveryGuard } from "../entity-notification-delivery.js";
import type { ClaimedNotificationDelivery } from "../durable-delivery.js";
const id = "11111111-1111-4111-8111-111111111111";
const delivery: ClaimedNotificationDelivery = {
  id,
  tenantId: id,
  planeKey: "neon",
  messageId: id,
  principalId: id,
  actorPrincipalId: id,
  recipientAddress: "local@example.test",
  channel: "email",
  templateKey: "comment_mention",
  subject: null,
  payload: {
    data: {
      notification_event_code: "collaboration.comment.mentioned",
      resource_id: id,
      parent_entity_code: "employee",
      parent_record_id: "record-1",
      entity_type: "employee",
      entity_id: "record-1",
    },
  },
  attemptCount: 1,
  maxAttempts: 3,
  workerId: "test",
};
async function guard(
  input: {
    disabled?: boolean;
    denied?: boolean;
    optOut?: boolean;
    consent?: boolean;
  } = {},
) {
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        end: async () => {},
        connect: async () => ({
          query: async () => ({
            rows: input.optOut ? [{ is_enabled: false }] : [],
          }),
          release() {},
        }),
      } as any,
    }),
  });
  const fallback = vi.fn(async () => ({ allowed: true }));
  try {
    const check = createEntityNotificationDeliveryGuard({
      transactions: {
        run: async (_p, _s, w) =>
          w(db as unknown as Transaction<Record<string, never>>),
      },
      consent: {
        checkAt: async () => ({ consented: input.consent !== false }),
      } as any,
      policy: {
        prepare: async (s) => s,
        authorizeRecipient: async () => !input.denied,
      },
      route: async () =>
        input.disabled ? null : ({ rule: { channels: ["email"] } } as any),
      fallback,
    });
    return { result: await check(delivery), fallback };
  } finally {
    await db.destroy();
  }
}
it("rechecks access and current policy instead of falling through to broad delivery", async () => {
  for (const options of [
    { disabled: true },
    { denied: true },
    { optOut: true },
    { consent: false },
  ]) {
    const r = await guard(options);
    expect(r.result.allowed).toBe(false);
    expect(r.fallback).not.toHaveBeenCalled();
  }
  expect((await guard()).result.allowed).toBe(true);
});
