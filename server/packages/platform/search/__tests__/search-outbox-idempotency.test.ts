import { describe, expect, it, vi } from "vitest";

import { createSearchOutboxHandler } from "../handlers/search-outbox.handler.js";

describe("search outbox projection idempotency", () => {
  it("replaying the same deterministic event replaces rather than duplicates the document", async () => {
    const row = {
      id: "22222222-2222-2222-2222-222222222222",
      tenant_id: "11111111-1111-1111-1111-111111111111",
      code: "SUP-1",
      row_version: 7,
    };
    const db = {
      selectFrom: vi.fn(() => ({
        selectAll: vi.fn(() => ({
          where: vi.fn(() => ({
            where: vi.fn(() => ({ executeTakeFirst: vi.fn().mockResolvedValue(row) })),
          })),
        })),
      })),
    };
    const projected = new Map<string, Record<string, unknown>>();
    const search = {
      isReady: () => true,
      upsert: vi.fn(async (documents: Array<Record<string, unknown>>) => {
        for (const document of documents) projected.set(String(document["id"]), document);
      }),
      deleteByEntityRef: vi.fn(),
    };
    const handler = createSearchOutboxHandler({
      db: db as never,
      search: search as never,
      metaService: { resolve: async () => ({ schema: "master", table: "supplier" }), invalidate: () => undefined },
    });
    const event = {
      id: "44444444-4444-4444-4444-444444444444",
      tenant_id: row.tenant_id,
      topic: "search",
      event_type: "supplier.updated",
      event_key: `${row.tenant_id}/supplier/${row.id}/7/supplier.updated`,
      entity_type: "supplier",
      entity_id: row.id,
      aggregate_id: null,
      payload: {},
      actor_id: null,
      attempts: 1,
      max_attempts: 5,
      created_at: new Date(),
    };

    await handler.handle(event);
    await handler.handle({ ...event, attempts: 2 });

    expect(search.upsert).toHaveBeenCalledTimes(2);
    expect(projected.size).toBe(1);
  });
});
