import type { Kysely } from "kysely";
import type { DB } from "../../generated/kysely/types.js";

export type OutboxRow = {
  id: string;
  event_type: string;
  payload: unknown;
  published_at: Date | null;
  created_at: Date;
};

export async function findUnpublishedOutboxEvents(
  db: Kysely<DB>,
  limit = 100,
): Promise<OutboxRow[]> {
  return db
    .selectFrom("int.outbox as o" as never)
    .select(["o.id", "o.event_type", "o.payload", "o.published_at", "o.created_at"] as never[])
    .where("o.published_at" as never, "is", null)
    .orderBy("o.created_at" as never, "asc")
    .limit(limit)
    .execute() as Promise<OutboxRow[]>;
}

export async function markOutboxEventPublished(
  db: Kysely<DB>,
  id: string,
): Promise<void> {
  await db
    .updateTable("int.outbox" as never)
    .set({ published_at: new Date() } as never)
    .where("id" as never, "=", id as never)
    .execute();
}
