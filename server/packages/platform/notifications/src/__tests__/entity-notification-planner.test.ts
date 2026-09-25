import { expect, it, vi } from "vitest";
import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { createNotificationPlanner } from "../notification-planner.js";
import { resolveEntityNotificationRoute } from "../entity-notification-routing.js";
const tenant = "11111111-1111-4111-8111-111111111111",
  actor = "22222222-2222-4222-8222-222222222222",
  recipient = "33333333-3333-4333-8333-333333333333",
  comment = "44444444-4444-4444-8444-444444444444",
  message = "55555555-5555-4555-8555-555555555555";
const source = {
  id: "event-1",
  planeKey: "neon" as const,
  tenantId: tenant,
  actorPrincipalId: actor,
  entityType: "document.comment",
  entityId: comment,
  eventCode: "collaboration.comment.mentioned",
  payload: {
    entity_type: "business_partner",
    entity_id: "bp-1",
    comment_id: comment,
    excerpt: "hello",
    recipient_principal_ids: [recipient],
  },
};
async function run(
  options: {
    deny?: boolean;
    optOut?: boolean;
    noConsent?: boolean;
    dedup?: boolean;
    disabled?: boolean;
    entityCode?: string;
  } = {},
) {
  const queries: { text: string; parameters: readonly unknown[] }[] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        end: async () => {},
        connect: async () => ({
          release() {},
          query: async (text: string, parameters: readonly unknown[]) => {
            queries.push({ text, parameters });
            if (text.includes("control.notification_routing_rule"))
              throw Error("Legacy broad rule must not run");
            if (
              text.includes("notification_delivery WHERE") &&
              text.includes("dedup_key")
            )
              return { rows: options.dedup ? [{ id: message }] : [] };
            if (text.includes("principal_notification_preference"))
              return { rows: options.optOut ? [{ is_enabled: false }] : [] };
            if (text.includes("master.contact_link"))
              return { rows: [{ value: "local@example.test" }] };
            if (text.includes("INSERT INTO event.notification_message "))
              return { rows: [{ id: message }] };
            return { rows: [] };
          },
        }),
      } as any,
    }),
  });
  const consent = {
    checkAt: vi.fn(async () => ({ consented: !options.noConsent })),
  } as any;
  try {
    const planner = createNotificationPlanner({
      transactions: {
        run: async (_p, _s, work) =>
          work(db as unknown as Transaction<Record<string, never>>),
      },
      consent,
      policy: {
        prepare: async (s) => s,
        authorizeRecipient: async () => !options.deny,
      },
      entityRoute: (s) =>
        resolveEntityNotificationRoute(s, async () =>
          options.disabled
            ? {
                notifications: {
                  comments: {
                    configuration: {
                      schemaVersion: 1,
                      mode: "disabled",
                      defaultPolicyRef: "platform.comments.notifications.v1",
                      templates: [],
                      rules: [],
                    },
                  },
                },
              }
            : null,
        ),
    });
    return {
      result: await planner.plan({
        ...source,
        payload: {
          ...source.payload,
          entity_type: options.entityCode ?? "business_partner",
        },
      }),
      queries,
      consent,
    };
  } finally {
    await db.destroy();
  }
}
it("plans one parent-aware message with two deliveries, without legacy-rule duplication", async () => {
  const { result, queries } = await run();
  expect(result).toMatchObject({ messages: 1, deliveries: 2 });
  const message = queries.find((q) =>
    q.text.includes("INSERT INTO event.notification_message "),
  )!;
  expect(message.parameters).toContain("business_partner");
  expect(message.parameters).toContain(null); // Published policy has no operational control-rule FK.
  const deliveries = queries.filter((q) =>
    q.text.includes("INSERT INTO event.notification_delivery"),
  );
  expect(deliveries).toHaveLength(2);
  expect(
    deliveries.every((q) =>
      q.parameters.some(
        (p) => typeof p === "string" && p.includes('"dedup_key"'),
      ),
    ),
  ).toBe(true);
  expect(
    queries.filter((q) => q.text.includes("pg_advisory_xact_lock")),
  ).toHaveLength(2);
});
it.each([
  { deny: true },
  { optOut: true },
  { dedup: true },
  { disabled: true },
])(
  "suppresses unauthorized, opted-out, repeated and disabled notifications: %j",
  async (options) => {
    const { result, queries } = await run(options);
    expect(result.deliveries).toBe(0);
    expect(
      queries.some((q) =>
        q.text.includes("INSERT INTO event.notification_delivery"),
      ),
    ).toBe(false);
  },
);
it("requires external consent while retaining eligible in-app delivery", async () => {
  expect((await run({ noConsent: true })).result.deliveries).toBe(1);
});

it("reuses the same planner for a neutral second entity", async () => {
  expect((await run({ entityCode: "fixture_order" })).result.deliveries).toBe(
    2,
  );
});
