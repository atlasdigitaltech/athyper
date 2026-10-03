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
    // Readable through Manage, with no title, identity or status projection: the stored label stays.
    const service = createRecordBookmarkService({
      transactions: db.transactions,
      listExecutor: {
        execute: vi.fn(async () => ({
          descriptor: { storage: { idField: "id" } },
          result: { data: [{ id: ID_A }] },
        })),
      } as never,
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

it("lists only the current entity's readable favourites and passes work scope to row authorization", async () => {
  const db = databaseHarness(
    [ID_A, ID_B].map((id, index) => ({
      id,
      record_id: id,
      entity_code: "business_partner",
      label_snapshot: `Partner ${index}`,
      created_at: "2026-09-08T10:00:00Z",
    })),
  );
  const execute = vi.fn(async () => ({
    descriptor: { storage: { idField: "id" } },
    result: { data: [{ id: ID_B }] },
  }));
  const service = createRecordBookmarkService({
    transactions: db.transactions,
    listExecutor: { execute } as never,
  });
  const scopeCoordinate = {
    operatingOrganizationIds: [ID_A],
    partnerRole: "supplier" as const,
  };
  const rows = await service.list(context, "business_partner", scopeCoordinate);
  expect(rows.map((row) => row.recordId)).toEqual([ID_B]);
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({
      context,
      entityCode: "business_partner",
      recordIds: [ID_A, ID_B],
      scopeCoordinate,
      countMode: "none",
    }),
  );
  expect(db.query.mock.calls[0]![0]).toContain("AND entity_code=$3");
  expect(db.query.mock.calls[0]![1]).toContain("business_partner");
});

it("does not return stored labels when scoped favourite authorization fails", async () => {
  const db = databaseHarness([
    {
      id: ID_A,
      record_id: ID_A,
      entity_code: "business_partner",
      label_snapshot: "Restricted partner",
      created_at: "2026-09-08T10:00:00Z",
    },
  ]);
  const service = createRecordBookmarkService({
    transactions: db.transactions,
    listExecutor: {
      execute: vi.fn(async () => {
        throw new Error("Scope unavailable");
      }),
    } as never,
  });
  await expect(service.list(context, "business_partner")).rejects.toThrow(
    "Scope unavailable",
  );
});

it("uses current readable title, code and status instead of a stored label snapshot", async () => {
  const db = databaseHarness([
    {
      id: ID_A,
      record_id: ID_A,
      entity_code: "asset",
      label_snapshot: "Old restricted name",
      created_at: "2026-09-08T10:00:00Z",
    },
  ]);
  const execute = vi.fn(async () => ({
    descriptor: {
      storage: { idField: "id" },
      listPresentation: { identityField: "code" },
    },
    responseFields: [
      { key: "name", list: { semanticRole: "title" } },
      { key: "code" },
      { key: "state", list: { semanticRole: "status" } },
    ],
    result: {
      data: [
        { id: ID_A, name: "Current name", code: "AS-001", state: "Active" },
      ],
    },
  }));
  const service = createRecordBookmarkService({
    transactions: db.transactions,
    listExecutor: { execute } as never,
  });
  expect(await service.list(context, "asset")).toEqual([
    expect.objectContaining({
      label: "Current name",
      description: "AS-001 · Active",
      code: "AS-001",
      status: "Active",
    }),
  ]);
});

const ID_C = "018f6d2a-3333-7a33-8333-333333333333";
const ID_D = "018f6d2a-4444-7a44-8444-444444444444";
const stored = (id: string, entityCode: string, label: string) => ({
  id,
  record_id: id,
  entity_code: entityCode,
  label_snapshot: label,
  created_at: "2026-09-08T10:00:00Z",
});

it("revalidates every entity in the all-favourites list with current title, code and status", async () => {
  const db = databaseHarness([
    stored(ID_A, "person", "PERSON-DEMO-001"),
    stored(ID_B, "country", "AF"),
    stored(ID_C, "person", "PERSON-GONE"),
  ]);
  const execute = vi.fn(async (query: { entityCode: string }) =>
    query.entityCode === "person"
      ? {
          descriptor: { storage: { idField: "id" }, listPresentation: { identityField: "code" } },
          responseFields: [{ key: "name", list: { semanticRole: "title" } }, { key: "code" }],
          // ID_C is no longer readable through Manage: it drops out.
          result: { data: [{ id: ID_A, name: "Maya Example (Demo)", code: "PERSON-DEMO-001" }] },
        }
      : {
          descriptor: { storage: { idField: "id" }, listPresentation: { identityField: "iso2" } },
          responseFields: [{ key: "name", list: { semanticRole: "title" } }, { key: "iso2" }],
          result: { data: [{ id: ID_B, name: "Afghanistan", iso2: "AF" }] },
        },
  );
  const service = createRecordBookmarkService({
    transactions: db.transactions,
    listExecutor: { execute } as never,
  });
  const rows = await service.list(context);
  expect(rows.map((row) => [row.recordId, row.label, row.code])).toEqual([
    [ID_A, "Maya Example (Demo)", "PERSON-DEMO-001"],
    [ID_B, "Afghanistan", "AF"],
  ]);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({ entityCode: "person", recordIds: [ID_A, ID_C], countMode: "none" }),
  );
});

it("drops unreadable entities, keeps work-context entities as stored, and never labels with an id", async () => {
  const db = databaseHarness([
    stored(ID_A, "restricted_thing", "Hidden"),
    stored(ID_B, "business_partner", "BP-001"),
    { ...stored(ID_C, "asset", ""), label_snapshot: null },
    stored(ID_D, "retired_entity", "Retired"),
  ]);
  const execute = vi.fn(async (query: { entityCode: string }) => {
    if (query.entityCode === "restricted_thing")
      throw new RecordServiceError(403, "RECORD_READ_FORBIDDEN", "Forbidden");
    if (query.entityCode === "retired_entity")
      throw new RecordServiceError(404, "ENTITY_DESCRIPTOR_NOT_FOUND", "Gone");
    if (query.entityCode === "business_partner")
      throw new RecordServiceError(409, "RECORD_LIST_SCOPE_REQUIRED", "Select a work context");
    // Readable, but metadata projects no title or identity field.
    return { descriptor: { storage: { idField: "id" } }, responseFields: [], result: { data: [{ id: ID_C }] } };
  });
  const service = createRecordBookmarkService({
    transactions: db.transactions,
    listExecutor: { execute } as never,
  });
  const rows = await service.list(context);
  expect(rows.map((row) => row.recordId)).toEqual([ID_B, ID_C]);
  expect(rows[0]).toMatchObject({ label: "BP-001" });
  expect(rows[1]!.label).toBeUndefined();
  expect(JSON.stringify(rows.map((row) => row.label))).not.toContain(ID_C);
});

it("fails the all-favourites list on unexpected errors rather than returning stored labels", async () => {
  const db = databaseHarness([stored(ID_A, "person", "PERSON-DEMO-001")]);
  const service = createRecordBookmarkService({
    transactions: db.transactions,
    listExecutor: { execute: vi.fn(async () => { throw new Error("database unavailable"); }) } as never,
  });
  await expect(service.list(context)).rejects.toThrow("database unavailable");
});

it("takes the title and code from the published record presentation, as the record page header does", async () => {
  const db = databaseHarness([stored(ID_A, "person", "PERSON-DEMO-001")]);
  // Person-style metadata: no list title role, a record presentation with title and code fields.
  const execute = vi.fn(async () => ({
    descriptor: {
      storage: { idField: "id" },
      listPresentation: { identityField: "code" },
      recordPresentation: { titleField: "name", codeField: "code" },
    },
    responseFields: [{ key: "code" }, { key: "name" }, { key: "status", list: { semanticRole: "status" } }],
    result: { data: [{ id: ID_A, code: "PERSON-DEMO-001", name: "Maya Example (Demo)", status: "Active" }] },
  }));
  const service = createRecordBookmarkService({ transactions: db.transactions, listExecutor: { execute } as never });
  expect(await service.list(context)).toEqual([
    expect.objectContaining({ label: "Maya Example (Demo)", code: "PERSON-DEMO-001", status: "Active" }),
  ]);
});

it("falls back to the code when the presentation title field is not readable", async () => {
  const db = databaseHarness([stored(ID_A, "person", "PERSON-DEMO-001")]);
  const execute = vi.fn(async () => ({
    descriptor: { storage: { idField: "id" }, recordPresentation: { titleField: "name", codeField: "code" } },
    // Field-level authorization removed `name` from the projection.
    responseFields: [{ key: "code" }],
    result: { data: [{ id: ID_A, code: "PERSON-DEMO-001", name: "Hidden name" }] },
  }));
  const service = createRecordBookmarkService({ transactions: db.transactions, listExecutor: { execute } as never });
  const [row] = await service.list(context);
  expect(row).toMatchObject({ label: "PERSON-DEMO-001", code: "PERSON-DEMO-001" });
  expect(JSON.stringify(row)).not.toContain("Hidden name");
});
