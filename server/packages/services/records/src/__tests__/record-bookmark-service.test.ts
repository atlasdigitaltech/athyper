import { Kysely, PostgresDialect } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { RecordServiceError } from "../errors.js";
import { createRecordBookmarkService } from "../bookmarks/record-bookmark-service.js";

const ID_A = "018f6d2a-1111-7a11-8111-111111111111";
const ID_B = "018f6d2a-2222-7a22-8222-222222222222";
const context = {
  planeKey: "neon",
  tenantId: "018f6d2a-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
  principalId: "018f6d2a-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
} as never;

describe("record bookmark service", () => {
  it("resolves a visible page from one cached principal/entity membership set", async () => {
    const get = vi.fn(async () => JSON.stringify([ID_A]));
    const service = createRecordBookmarkService({
      transactions: { run: vi.fn() } as never,
      listExecutor: {} as never,
      cache: { get, set: vi.fn(), delete: vi.fn() },
    });
    await expect(
      service.membership(context, "business_partner", [ID_A, ID_B]),
    ).resolves.toEqual(new Set([ID_A]));
    expect(get).toHaveBeenCalledOnce();
  });

  it("rejects an add when the authorized list boundary cannot read every target", async () => {
    const execute = vi.fn(async () => ({
      descriptor: { storage: { idField: "id" } },
      result: { data: [{ id: ID_A }] },
    }));
    const run = vi.fn();
    const service = createRecordBookmarkService({
      transactions: { run } as never,
      listExecutor: { execute } as never,
    });
    await expect(
      service.add(context, "business_partner", [{ id: ID_A }, { id: ID_B }]),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "BOOKMARK_RECORD_FORBIDDEN",
    } satisfies Partial<RecordServiceError>);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ recordIds: [ID_A, ID_B], limit: 2 }),
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed before persistence for invalid or excessive identities", async () => {
    const service = createRecordBookmarkService({
      transactions: { run: vi.fn() } as never,
      listExecutor: {} as never,
    });
    await expect(
      service.remove(context, "business_partner", ["not-a-uuid"]),
    ).rejects.toMatchObject({ code: "INVALID_BOOKMARK_RECORDS" });
    await expect(
      service.remove(
        context,
        "business_partner",
        Array.from(
          { length: 101 },
          (_, index) =>
            `018f6d2a-${String(index).padStart(4, "0")}-7a11-8111-111111111111`,
        ),
      ),
    ).rejects.toMatchObject({ code: "INVALID_BOOKMARK_RECORDS" });
  });
});

// Execute the actual SQL builder against a recording PostgreSQL connection.
function databaseHarness(rows: readonly Record<string, unknown>[] = []) {
  const query = vi.fn(
    async (_sql: string, _parameters: readonly unknown[]) => ({
      rows,
      command: "SELECT",
      rowCount: rows.length,
    }),
  );
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const run = vi.fn(
    async (
      _plane: unknown,
      _actor: unknown,
      work: (tx: unknown) => Promise<unknown>,
    ) => work(database),
  );
  return { query, run, transactions: { run } as never };
}

describe("record bookmark persistence regressions", () => {
  it.each(["not-json", "{}", '["invalid"]', "[42]"])(
    "falls back to scoped SQL for corrupt cache %s",
    async (cached) => {
      const db = databaseHarness([{ record_id: ID_A }]);
      const set = vi.fn();
      const service = createRecordBookmarkService({
        transactions: db.transactions,
        listExecutor: {} as never,
        cache: { get: vi.fn(async () => cached), set, delete: vi.fn() },
      });
      await expect(
        service.membership(context, "business_partner", [ID_A, ID_B]),
      ).resolves.toEqual(new Set([ID_A]));
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining(
          "tenant_id=$1::uuid AND principal_id=$2::uuid AND entity_code=$3",
        ),
        [
          "018f6d2a-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
          "018f6d2a-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
          "business_partner",
        ],
      );
      expect(db.run).toHaveBeenCalledWith(
        "neon",
        {
          tenantId: "018f6d2a-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
          principalId: "018f6d2a-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
        },
        expect.any(Function),
      );
      expect(set).toHaveBeenCalledWith(
        expect.stringContaining(":neon:"),
        JSON.stringify([ID_A]),
        { ttlSeconds: 45 },
      );
    },
  );

  it("normalizes cached UUIDs and isolates cache keys by plane, tenant and principal", async () => {
    const get = vi.fn(async () => JSON.stringify([ID_A.toUpperCase()]));
    const service = createRecordBookmarkService({
      transactions: { run: vi.fn() } as never,
      listExecutor: {} as never,
      cache: { get, set: vi.fn(), delete: vi.fn() },
    });
    await expect(
      service.membership(context, "business_partner", [ID_A.toUpperCase()]),
    ).resolves.toEqual(new Set([ID_A]));
    expect(get).toHaveBeenCalledWith(
      "record-bookmarks:v1:neon:018f6d2a-aaaa-7aaa-8aaa-aaaaaaaaaaaa:018f6d2a-bbbb-7bbb-8bbb-bbbbbbbbbbbb:business_partner",
    );
  });

  it("preserves PostgreSQL Date precision and orders the recent list deterministically", async () => {
    const date = "2026-09-06T12:34:56.789Z";
    const db = databaseHarness([
      {
        id: ID_B,
        entity_code: "business_partner",
        record_id: ID_A,
        label_snapshot: "Partner",
        created_at: new Date(date),
      },
    ]);
    const service = createRecordBookmarkService({
      transactions: db.transactions,
      listExecutor: {} as never,
    });
    await expect(service.list(context)).resolves.toEqual([
      {
        id: ID_B,
        entityCode: "business_partner",
        recordId: ID_A,
        label: "Partner",
        createdAt: date,
      },
    ]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY created_at DESC, id DESC LIMIT 200"),
      expect.any(Array),
    );
  });

  it("deduplicates authorized additions, forwards scope and tolerates cache outages after commit", async () => {
    const db = databaseHarness();
    const execute = vi.fn(async () => ({
      descriptor: { storage: { idField: "record_id" } },
      result: { data: [{ record_id: ID_A }] },
    }));
    const invalidate = vi.fn(async () => {
      throw new Error("cache unavailable");
    });
    const service = createRecordBookmarkService({
      transactions: db.transactions,
      listExecutor: { execute } as never,
      cache: { get: vi.fn(), set: vi.fn(), delete: invalidate },
    });
    const scope = { operatingOrganizationId: ID_B };
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        service.add(
          context,
          "business_partner",
          [
            { id: ID_A.toUpperCase(), label: " Partner " },
            { id: ID_A, label: " Partner " },
          ],
          scope,
        ),
      ).resolves.toEqual(new Set([ID_A]));
    }
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        recordIds: [ID_A],
        limit: 1,
        scopeCoordinate: scope,
      }),
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "ON CONFLICT (tenant_id,principal_id,entity_code,record_id) DO NOTHING",
      ),
      expect.arrayContaining([ID_A, "Partner"]),
    );
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("removes only the principal's explicit targets without requiring access to the former record", async () => {
    const db = databaseHarness();
    const execute = vi.fn();
    const service = createRecordBookmarkService({
      transactions: db.transactions,
      listExecutor: { execute } as never,
    });
    for (let attempt = 0; attempt < 2; attempt++)
      await expect(
        service.remove(context, "business_partner", [ID_A, ID_A.toUpperCase()]),
      ).resolves.toEqual(new Set([ID_A]));
    expect(execute).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "tenant_id=$1::uuid AND principal_id=$2::uuid AND entity_code=$3 AND record_id IN ($4::uuid)",
      ),
      [
        "018f6d2a-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
        "018f6d2a-bbbb-7bbb-8bbb-bbbbbbbbbbbb",
        "business_partner",
        ID_A,
      ],
    );
  });

  it("rejects database-incompatible entity codes and oversized duplicate batches before IO", async () => {
    const db = databaseHarness();
    const service = createRecordBookmarkService({
      transactions: db.transactions,
      listExecutor: {} as never,
    });
    for (const code of ["a", "A_bad", "a".repeat(128), "bad/code"]) {
      await expect(
        service.membership(context, code, [ID_A]),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        service.add(context, code, [{ id: ID_A }]),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(service.remove(context, code, [ID_A])).rejects.toMatchObject(
        { statusCode: 400 },
      );
    }
    await expect(
      service.remove(context, "business_partner", Array(101).fill(ID_A)),
    ).rejects.toMatchObject({ code: "INVALID_BOOKMARK_RECORDS" });
    expect(db.run).not.toHaveBeenCalled();
  });
  it("counts label characters consistently with PostgreSQL and JSON Schema", async () => {
    const db = databaseHarness();
    const execute = vi.fn(async () => ({
      descriptor: { storage: { idField: "id" } },
      result: { data: [{ id: ID_A }] },
    }));
    const service = createRecordBookmarkService({
      transactions: db.transactions,
      listExecutor: { execute } as never,
    });
    await expect(
      service.add(context, "business_partner", [
        { id: ID_A, label: "😀".repeat(240) },
      ]),
    ).resolves.toEqual(new Set([ID_A]));
    await expect(
      service.add(context, "business_partner", [
        { id: ID_A, label: "😀".repeat(241) },
      ]),
    ).rejects.toMatchObject({ code: "INVALID_BOOKMARK_LABEL" });
    expect(db.run).toHaveBeenCalledOnce();
  });
});
