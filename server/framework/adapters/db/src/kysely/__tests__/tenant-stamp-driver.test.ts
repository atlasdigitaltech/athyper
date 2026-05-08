// server/framework/adapters/db/src/kysely/__tests__/tenant-stamp-driver.test.ts
//
// Unit tests for TenantStampDriver. Uses a FakeDriver that records every
// call so the test asserts the exact SQL the driver emits without needing a
// live Postgres. Integration behavior (PgBouncer round-trips, real RLS
// enforcement, concurrency safety) lives in server/scripts/verify-tenant-stamp.ts,
// which the CI job runs against a real pg + pgbouncer stack.

import { describe, it, expect, beforeEach } from "vitest";

import type {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  QueryResult,
  TransactionSettings,
} from "kysely";

import { TenantStampDriver } from "../tenant-stamp-driver.js";

// ─── Fakes ────────────────────────────────────────────────────────────────────

interface Event {
  readonly op:
    | "acquire"
    | "release"
    | "begin"
    | "commit"
    | "rollback"
    | "execute"
    | "stream";
  readonly connectionId?: number;
  readonly sql?: string;
  readonly parameters?: ReadonlyArray<unknown>;
}

class FakeConnection implements DatabaseConnection {
  constructor(
    readonly id: number,
    private readonly events: Event[],
    private readonly queryResults: Map<string, QueryResult<unknown>>,
    private readonly throwOn: Set<string>,
  ) {}

  async executeQuery<R>(cq: CompiledQuery): Promise<QueryResult<R>> {
    this.events.push({
      op: "execute",
      connectionId: this.id,
      sql: cq.sql,
      parameters: cq.parameters,
    });
    if (this.throwOn.has(cq.sql)) {
      throw new Error(`boom: ${cq.sql}`);
    }
    const canned = this.queryResults.get(cq.sql);
    if (canned !== undefined) return canned as QueryResult<R>;
    return { rows: [] as R[] };
  }

  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    this.events.push({ op: "stream", connectionId: this.id });
    yield { rows: [] as R[] };
  }
}

class FakeDriver implements Driver {
  readonly events: Event[] = [];
  readonly queryResults = new Map<string, QueryResult<unknown>>();
  readonly throwOn = new Set<string>();
  private nextId = 1;
  private readonly connections = new WeakMap<DatabaseConnection, FakeConnection>();

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    const conn = new FakeConnection(
      this.nextId++,
      this.events,
      this.queryResults,
      this.throwOn,
    );
    this.connections.set(conn, conn);
    this.events.push({ op: "acquire", connectionId: conn.id });
    return conn;
  }

  async beginTransaction(
    connection: DatabaseConnection,
    _settings: TransactionSettings,
  ): Promise<void> {
    const conn = this.connections.get(connection);
    this.events.push({ op: "begin", connectionId: conn?.id });
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    const conn = this.connections.get(connection);
    this.events.push({ op: "commit", connectionId: conn?.id });
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    const conn = this.connections.get(connection);
    this.events.push({ op: "rollback", connectionId: conn?.id });
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    const conn = this.connections.get(connection);
    this.events.push({ op: "release", connectionId: conn?.id });
  }

  async destroy(): Promise<void> {}
}

// Helper — minimal CompiledQuery shape; matches what Kysely passes driver.
function cq(sql: string, parameters: ReadonlyArray<unknown> = []): CompiledQuery {
  return {
    sql,
    parameters,
    query: { kind: "RawNode" } as CompiledQuery["query"],
    queryId: { queryId: "test" } as CompiledQuery["queryId"],
  };
}

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

function sqlsOnly(events: Event[]): string[] {
  return events
    .filter((e) => e.op === "execute")
    .map((e) => e.sql ?? "");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("TenantStampDriver", () => {
  let base: FakeDriver;

  beforeEach(() => {
    base = new FakeDriver();
  });

  it("wraps standalone queries in BEGIN/SET LOCAL/query/COMMIT when tenant is in context", async () => {
    const driver = new TenantStampDriver(base, {
      base: null as never,
      tenantIdProvider: () => TENANT_A,
    });

    const conn = await driver.acquireConnection();
    await conn.executeQuery(cq("SELECT 1 FROM master.content_item"));

    expect(sqlsOnly(base.events)).toEqual([
      "BEGIN",
      "SELECT set_config('app.current_tenant_id', $1, true)",
      "SELECT 1 FROM master.content_item",
      "COMMIT",
    ]);

    // The tenant parameter is bound, not inlined.
    const setEvent = base.events.find(
      (e) => e.sql === "SELECT set_config('app.current_tenant_id', $1, true)",
    );
    expect(setEvent?.parameters).toEqual([TENANT_A]);
  });

  it("no-ops the wrapping when no tenant is in context", async () => {
    const driver = new TenantStampDriver(base, {
      base: null as never,
      tenantIdProvider: () => null,
    });

    const conn = await driver.acquireConnection();
    await conn.executeQuery(cq("SELECT 1 FROM shared.country"));

    expect(sqlsOnly(base.events)).toEqual(["SELECT 1 FROM shared.country"]);
  });

  it("no-ops when the tenant id is not a valid UUID", async () => {
    const skipped: Array<{ reason: string; value: unknown }> = [];
    const driver = new TenantStampDriver(base, {
      base: null as never,
      tenantIdProvider: () => "not-a-uuid",
      onSkippedStamp: (reason, value) => skipped.push({ reason, value }),
    });

    const conn = await driver.acquireConnection();
    await conn.executeQuery(cq("SELECT 1"));

    expect(sqlsOnly(base.events)).toEqual(["SELECT 1"]);
    expect(skipped).toEqual([{ reason: "invalid-uuid", value: "not-a-uuid" }]);
  });

  it("stamps once at beginTransaction and does not wrap queries inside the tx", async () => {
    const driver = new TenantStampDriver(base, {
      base: null as never,
      tenantIdProvider: () => TENANT_A,
    });

    const conn = await driver.acquireConnection();
    await driver.beginTransaction(conn, {});
    await conn.executeQuery(cq("INSERT INTO master.comment(...)"));
    await conn.executeQuery(cq("UPDATE master.comment SET ..."));
    await driver.commitTransaction(conn);

    // One BEGIN, one stamp, two user queries, one COMMIT — no extra
    // BEGIN/COMMIT wrapping around the individual queries.
    expect(base.events.map((e) => e.op)).toEqual([
      "acquire",
      "begin",
      "execute", // SET stamp
      "execute", // INSERT
      "execute", // UPDATE
      "commit",
    ]);

    expect(sqlsOnly(base.events)).toEqual([
      "SELECT set_config('app.current_tenant_id', $1, true)",
      "INSERT INTO master.comment(...)",
      "UPDATE master.comment SET ...",
    ]);
  });

  it("rolls back the implicit transaction when the wrapped query throws", async () => {
    base.throwOn.add("SELECT bad");
    const driver = new TenantStampDriver(base, {
      base: null as never,
      tenantIdProvider: () => TENANT_A,
    });

    const conn = await driver.acquireConnection();

    await expect(conn.executeQuery(cq("SELECT bad"))).rejects.toThrow("boom");

    // After the throw the wrapper must have issued ROLLBACK and not COMMIT.
    const sqls = sqlsOnly(base.events);
    expect(sqls).toContain("BEGIN");
    expect(sqls).toContain("ROLLBACK");
    expect(sqls).not.toContain("COMMIT");
  });

  it("reports rollback failures without hiding the original query error", async () => {
    base.throwOn.add("SELECT bad");
    base.throwOn.add("ROLLBACK");
    const rollbackFailures: Array<{ error: unknown; originalError: unknown }> = [];
    const driver = new TenantStampDriver(base, {
      base: null as never,
      tenantIdProvider: () => TENANT_A,
      onRollbackFailure: (error, originalError) => {
        rollbackFailures.push({ error, originalError });
      },
    });

    const conn = await driver.acquireConnection();

    await expect(conn.executeQuery(cq("SELECT bad"))).rejects.toThrow("boom: SELECT bad");
    expect(rollbackFailures).toHaveLength(1);
    expect(String(rollbackFailures[0]?.error)).toContain("boom: ROLLBACK");
    expect(String(rollbackFailures[0]?.originalError)).toContain("boom: SELECT bad");
  });

  it("keeps separate tenant stamps across two connections that run concurrently", async () => {
    // Interleave a TENANT_A query and a TENANT_B query by flipping the
    // provider between calls. Each executeQuery must see the snapshot that
    // was live at the moment it was invoked — the driver must not share
    // state across the two logical connections.
    const tenants = [TENANT_A, TENANT_B];
    let idx = 0;
    const driver = new TenantStampDriver(base, {
      base: null as never,
      tenantIdProvider: () => tenants[idx++ % tenants.length] ?? null,
    });

    const connA = await driver.acquireConnection();
    const connB = await driver.acquireConnection();

    await Promise.all([
      connA.executeQuery(cq("SELECT A")),
      connB.executeQuery(cq("SELECT B")),
    ]);

    // Extract just the SET LOCAL parameter bindings in emission order — the
    // two stamps should be distinct and not interleaved onto a single
    // connection.
    const setEvents = base.events.filter(
      (e) => e.sql === "SELECT set_config('app.current_tenant_id', $1, true)",
    );
    expect(setEvents).toHaveLength(2);
    const setTenants = new Set(
      setEvents.map((e) => (e.parameters ?? [])[0]),
    );
    expect(setTenants).toEqual(new Set([TENANT_A, TENANT_B]));
  });

  it("refuses streamQuery on a tenant-scoped query outside an explicit transaction", async () => {
    const driver = new TenantStampDriver(base, {
      base: null as never,
      tenantIdProvider: () => TENANT_A,
    });

    const conn = await driver.acquireConnection();
    await expect(async () => {
      for await (const _ of conn.streamQuery(cq("SELECT ..."))) {
        // no-op
      }
    }).rejects.toThrow(/streamQuery.*not supported/);
  });

  it("releases the base connection (not the wrapped object) on releaseConnection", async () => {
    const driver = new TenantStampDriver(base, {
      base: null as never,
      tenantIdProvider: () => null,
    });

    const conn = await driver.acquireConnection();
    const acquireId = base.events.find((e) => e.op === "acquire")?.connectionId;

    await driver.releaseConnection(conn);

    const releaseEvent = base.events.find((e) => e.op === "release");
    expect(releaseEvent?.connectionId).toBe(acquireId);
  });
});
