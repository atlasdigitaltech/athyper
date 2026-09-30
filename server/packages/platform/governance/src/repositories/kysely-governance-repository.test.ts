import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { expect, it } from "vitest";
import { KyselyChannelConsentRepository } from "./kysely-governance-repository.js";

it("uses the event-history ordering to break equal consent effective timestamps", async () => {
  const queries: string[] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      queries.push(event.query.sql);
    },
  });
  try {
    await expect(
      db
        .transaction()
        .execute((tx) =>
          new KyselyChannelConsentRepository().upsert(
            {
              tenantId: "tenant",
              subjectType: "principal",
              subjectId: "principal",
              channel: "email",
              consented: false,
              effectiveAt: "2026-09-06T00:00:00Z",
              eventId: "event",
              sourceCode: "api",
              evidence: {},
            },
            tx,
          ),
        ),
    ).rejects.toThrow("GOVERNANCE_CONSENT_WRITE_FAILED");
    const upsert = queries[0]!;
    expect(upsert).toContain("incoming.tenant_id = EXCLUDED.tenant_id");
    expect(upsert).toContain("previous.tenant_id = incoming.tenant_id");
    expect(upsert).toContain(
      "(incoming.created_at, incoming.id) >= (previous.created_at, previous.id)",
    );
    expect(upsert).not.toContain(
      "governance.channel_consent.last_event_id = EXCLUDED.last_event_id)",
    );
  } finally {
    await db.destroy();
  }
});
