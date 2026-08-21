import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
  type TransactionSettings,
} from "kysely";
import { describe, expect, it, vi } from "vitest";
import type { AnyDb } from "../../ai-runtime.types.js";
import type { AtlasMessageContentProtector } from "../protected-content-store.js";
import {
  SqlAtlasThreadMaintenanceAuthority,
  SqlAtlasThreadRepository,
} from "../sql-atlas-thread.repository.js";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL_ID = "20000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const RUN_ID = "40000000-0000-4000-8000-000000000001";
const CLIENT_REQUEST_ID = "50000000-0000-4000-8000-000000000001";
const INPUT_MESSAGE_ID = "60000000-0000-4000-8000-000000000001";
const OUTPUT_MESSAGE_ID = "60000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-07-23T10:00:00.000Z");
const STALE_BEFORE = new Date("2026-07-23T09:45:00.000Z");
const STALE_STARTED_AT = new Date("2026-07-23T09:30:00.000Z");
const STALE_RUN_ID = "40000000-0000-4000-8000-000000000009";
const STALE_CLIENT_REQUEST_ID = "50000000-0000-4000-8000-000000000009";
const STALE_INPUT_MESSAGE_ID = "60000000-0000-4000-8000-000000000009";
const STALE_OUTPUT_MESSAGE_ID = "60000000-0000-4000-8000-000000000010";

interface CapturedQuery {
  sql: string;
  parameters: readonly unknown[];
}

class FakeConnection implements DatabaseConnection {
  readonly queries: CapturedQuery[] = [];
  readonly results: unknown[][] = [];

  queue(...rows: unknown[][]): void {
    this.results.push(...rows);
  }

  async executeQuery<R>(
    compiledQuery: CompiledQuery,
  ): Promise<QueryResult<R>> {
    this.queries.push({
      sql: compiledQuery.sql.replace(/\s+/g, " ").trim(),
      parameters: compiledQuery.parameters,
    });
    return { rows: (this.results.shift() ?? []) as R[] };
  }

  async *streamQuery<R>(
    compiledQuery: CompiledQuery,
  ): AsyncIterableIterator<QueryResult<R>> {
    yield this.executeQuery(compiledQuery);
  }
}

class FakeDriver implements Driver {
  readonly connection = new FakeConnection();
  beginCount = 0;
  commitCount = 0;
  rollbackCount = 0;

  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return this.connection;
  }
  async beginTransaction(
    _connection: DatabaseConnection,
    _settings: TransactionSettings,
  ): Promise<void> {
    this.beginCount += 1;
  }
  async commitTransaction(_connection: DatabaseConnection): Promise<void> {
    this.commitCount += 1;
  }
  async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {
    this.rollbackCount += 1;
  }
  async releaseConnection(_connection: DatabaseConnection): Promise<void> {}
  async destroy(): Promise<void> {}
}

class FakePostgresDialect implements Dialect {
  constructor(private readonly driver: FakeDriver) {}
  createDriver(): Driver {
    return this.driver;
  }
  createQueryCompiler(): PostgresQueryCompiler {
    return new PostgresQueryCompiler();
  }
  createAdapter(): PostgresAdapter {
    return new PostgresAdapter();
  }
  createIntrospector(db: Kysely<unknown>): PostgresIntrospector {
    return new PostgresIntrospector(db);
  }
}

function database() {
  const driver = new FakeDriver();
  const db = new Kysely<Record<string, unknown>>({
    dialect: new FakePostgresDialect(driver),
  });
  return {
    db: db as unknown as AnyDb,
    connection: driver.connection,
    driver,
  };
}

function scope() {
  return {
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    plane: "neon" as const,
  };
}

function threadRow() {
  return {
    thread_id: THREAD_ID,
    tenant_id: TENANT_ID,
    plane: "neon",
    owner_principal_id: PRINCIPAL_ID,
    title: null,
    status: "active",
    row_version: "1",
    last_message_sequence: "0",
    retention_policy_id: "atlas-default-30d-v1",
    expires_at: new Date("2026-08-22T10:00:00.000Z"),
    purge_after: null,
    legal_hold: false,
    summary_version: 0,
    created_at: NOW,
    updated_at: null,
    activity_at: NOW,
    participant_role: "owner",
    access_principal_id: PRINCIPAL_ID,
  };
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    run_id: RUN_ID,
    thread_id: THREAD_ID,
    plane: "neon",
    principal_id: PRINCIPAL_ID,
    client_request_id: CLIENT_REQUEST_ID,
    input_message_id: INPUT_MESSAGE_ID,
    output_message_id: OUTPUT_MESSAGE_ID,
    status: "started",
    cancellation_requested_at: null,
    terminal_at: null,
    terminal_error_class: null,
    metering_run_id: null,
    started_at: NOW,
    ...overrides,
  };
}

describe("SqlAtlasThreadRepository", () => {
  it("stamps all RLS dimensions and creates envelope, Atlas state, then owner", async () => {
    const target = database();
    target.connection.queue([], [], [], [], [threadRow()]);
    const repository = new SqlAtlasThreadRepository(target.db);

    const created = await repository.create(scope(), {
      threadId: THREAD_ID,
      title: null,
      retentionPolicyId: "atlas-default-30d-v1",
      expiresAt: new Date("2026-08-22T10:00:00.000Z"),
    });

    expect(created.threadId).toBe(THREAD_ID);
    const sql = target.connection.queries.map((query) => query.sql);
    expect(sql[0]).toContain("app.current_tenant_id");
    expect(sql[0]).toContain("app.current_principal_id");
    expect(sql[0]).toContain("app.current_atlas_plane");
    expect(sql[1]).toContain("INSERT INTO master.conversation");
    expect(sql[2]).toContain("INSERT INTO master.atlas_thread");
    expect(sql[3]).toContain("INSERT INTO master.conversation_participant");
    expect(sql[4]).toContain("FROM master.atlas_thread");
  });

  it("persists input and pending output before the deferred run row", async () => {
    const target = database();
    target.connection.queue(
      [], // GUCs
      [], // advisory lock
      [{ thread_id: THREAD_ID, status: "active" }],
      [], // no stale active run
      [], // idempotency lookup
      [], // active-run lookup
      [{ sequence: "1" }],
      [{ sequence: "2" }],
      [runRow()],
    );
    const repository = new SqlAtlasThreadRepository(target.db);
    const hostileText = "bound only'; DROP TABLE master.atlas_message; --";

    const result = await repository.beginRun(scope(), {
      threadId: THREAD_ID,
      runId: RUN_ID,
      clientRequestId: CLIENT_REQUEST_ID,
      inputMessageId: INPUT_MESSAGE_ID,
      outputMessageId: OUTPUT_MESSAGE_ID,
      inputContentBlocks: [{ type: "text", text: hostileText }],
      startedAt: NOW,
      staleBefore: new Date("2026-07-23T09:45:00.000Z"),
    });

    expect(result).toMatchObject({
      replayed: false,
      recoveredStaleRun: false,
      inputSequence: "1",
      outputSequence: "2",
    });
    const queries = target.connection.queries;
    const inputIndex = queries.findIndex((query) =>
      query.sql.includes("INSERT INTO master.atlas_message")
      && query.sql.includes("'user'")
    );
    const outputIndex = queries.findIndex((query) =>
      query.sql.includes("INSERT INTO master.atlas_message")
      && query.sql.includes("'assistant'")
    );
    const runIndex = queries.findIndex((query) =>
      query.sql.includes("INSERT INTO event.atlas_run")
    );
    expect(inputIndex).toBeGreaterThan(0);
    expect(outputIndex).toBeGreaterThan(inputIndex);
    expect(runIndex).toBeGreaterThan(outputIndex);
    expect(queries[inputIndex]!.sql).not.toContain(hostileText);
    expect(queries[inputIndex]!.parameters).toContain(
      JSON.stringify([{ type: "text", text: hostileText }]),
    );
  });

  it("stores protected input by opaque reference without an inline transcript copy", async () => {
    const target = database();
    target.connection.queue(
      [],
      [],
      [{ thread_id: THREAD_ID, status: "active" }],
      [],
      [],
      [],
      [{ sequence: "1" }],
      [{ sequence: "2" }],
      [runRow()],
    );
    const protect = vi.fn(async () => ({
      contentBlocks: [],
      protectedContentRef: "atlas-protected/v1/opaque",
    }));
    const repository = new SqlAtlasThreadRepository(target.db, {
      protect,
    } as unknown as AtlasMessageContentProtector);

    await repository.beginRun(scope(), {
      threadId: THREAD_ID,
      runId: RUN_ID,
      clientRequestId: CLIENT_REQUEST_ID,
      inputMessageId: INPUT_MESSAGE_ID,
      outputMessageId: OUTPUT_MESSAGE_ID,
      inputContentBlocks: [{ type: "text", text: "sensitive" }],
      startedAt: NOW,
      staleBefore: STALE_BEFORE,
    });

    expect(protect).toHaveBeenCalledWith(
      scope(),
      INPUT_MESSAGE_ID,
      [{ type: "text", text: "sensitive" }],
    );
    const inputInsert = target.connection.queries.find((query) =>
      query.sql.includes("INSERT INTO master.atlas_message")
      && query.sql.includes("'user'")
    );
    expect(inputInsert?.sql).toContain("protected_content_ref");
    expect(inputInsert?.parameters).toContain("[]");
    expect(inputInsert?.parameters).toContain("atlas-protected/v1/opaque");
    expect(inputInsert?.parameters).not.toContain(
      JSON.stringify([{ type: "text", text: "sensitive" }]),
    );
  });

  it("reveals protected messages only through the tenant-scoped protector", async () => {
    const target = database();
    target.connection.queue(
      [],
      [{
        message_id: INPUT_MESSAGE_ID,
        thread_id: THREAD_ID,
        plane: "neon",
        sequence: "1",
        role: "user",
        status: "completed",
        content_blocks: [],
        protected_content_ref: "atlas-protected/v1/opaque",
        run_id: RUN_ID,
        parent_message_id: null,
        result_cards: [],
        citation_refs: [],
        tool_refs: [],
        terminal_error_class: null,
        created_at: NOW,
        terminal_at: NOW,
      }],
    );
    const reveal = vi.fn(async () => [
      { type: "text", text: "sensitive" },
    ]);
    const repository = new SqlAtlasThreadRepository(target.db, {
      reveal,
    } as unknown as AtlasMessageContentProtector);

    const page = await repository.listMessages(scope(), {
      threadId: THREAD_ID,
      limit: 20,
      cursor: null,
    });

    expect(reveal).toHaveBeenCalledWith(
      scope(),
      "atlas-protected/v1/opaque",
    );
    expect(page.items[0]?.contentBlocks).toEqual([
      { type: "text", text: "sensitive" },
    ]);
  });

  it("recovers an owner-scoped stale run with empty output before beginning a different request", async () => {
    const target = database();
    const stale = runRow({
      run_id: STALE_RUN_ID,
      client_request_id: STALE_CLIENT_REQUEST_ID,
      input_message_id: STALE_INPUT_MESSAGE_ID,
      output_message_id: STALE_OUTPUT_MESSAGE_ID,
      started_at: STALE_STARTED_AT,
    });
    target.connection.queue(
      [], // GUCs
      [], // tenant/client advisory lock
      [{ thread_id: THREAD_ID, status: "active" }], // owner thread lock
      [stale], // stale run lock
      [{ id: STALE_OUTPUT_MESSAGE_ID }], // empty failed assistant
      [{ id: STALE_RUN_ID }], // failed run
      [], // no replay for the new client request
      [], // no remaining active run
      [{ sequence: "3" }],
      [{ sequence: "4" }],
      [runRow()],
    );
    const repository = new SqlAtlasThreadRepository(target.db);

    const result = await repository.beginRun(scope(), {
      threadId: THREAD_ID,
      runId: RUN_ID,
      clientRequestId: CLIENT_REQUEST_ID,
      inputMessageId: INPUT_MESSAGE_ID,
      outputMessageId: OUTPUT_MESSAGE_ID,
      inputContentBlocks: [{ type: "text", text: "request after crash" }],
      startedAt: NOW,
      staleBefore: STALE_BEFORE,
    });

    expect(result).toMatchObject({
      replayed: false,
      recoveredStaleRun: true,
      run: { runId: RUN_ID, status: "started" },
      inputSequence: "3",
      outputSequence: "4",
    });
    const queries = target.connection.queries;
    const recoverySelect = queries.find((query) =>
      query.sql.includes("ORDER BY r.started_at, r.id")
    );
    expect(recoverySelect?.sql).toContain("r.tenant_id =");
    expect(recoverySelect?.sql).toContain("r.conversation_id =");
    expect(recoverySelect?.sql).toContain("r.plane =");
    expect(recoverySelect?.sql).toContain("r.principal_id =");
    expect(recoverySelect?.sql).toContain("r.started_at <=");
    expect(recoverySelect?.parameters).toEqual(expect.arrayContaining([
      TENANT_ID,
      "neon",
      PRINCIPAL_ID,
      THREAD_ID,
      STALE_BEFORE,
    ]));
    const messageUpdate = queries.find((query) =>
      query.sql.startsWith("UPDATE master.atlas_message")
      && query.sql.includes("terminal_error_class")
    );
    expect(messageUpdate?.sql).toContain("content_blocks = '[]'::jsonb");
    expect(messageUpdate?.sql).toContain("result_cards = '[]'::jsonb");
    expect(messageUpdate?.sql).toContain("citation_refs = '[]'::jsonb");
    expect(messageUpdate?.sql).toContain("tool_refs = '[]'::jsonb");
    expect(messageUpdate?.parameters).toEqual(expect.arrayContaining([
      "process_interrupted",
      STALE_OUTPUT_MESSAGE_ID,
      STALE_RUN_ID,
    ]));
    const recoveryRunUpdate = queries.find((query) =>
      query.sql.startsWith("UPDATE event.atlas_run")
      && query.sql.includes("started_at <=")
    );
    expect(recoveryRunUpdate?.parameters).toEqual(expect.arrayContaining([
      "process_interrupted",
      TENANT_ID,
      THREAD_ID,
      "neon",
      PRINCIPAL_ID,
      STALE_RUN_ID,
      STALE_BEFORE,
    ]));
    expect(queries.findIndex((query) =>
      query.sql.includes("INSERT INTO event.atlas_run")
    )).toBeGreaterThan(queries.indexOf(recoveryRunUpdate!));
  });

  it("terminalizes and replays an exact stale initial request without invoking a new run", async () => {
    const target = database();
    const stale = runRow({
      run_id: STALE_RUN_ID,
      client_request_id: STALE_CLIENT_REQUEST_ID,
      input_message_id: STALE_INPUT_MESSAGE_ID,
      output_message_id: STALE_OUTPUT_MESSAGE_ID,
      started_at: STALE_STARTED_AT,
    });
    const failed = {
      ...stale,
      status: "failed",
      terminal_at: NOW,
      terminal_error_class: "process_interrupted",
    };
    const sequences = [
      { id: STALE_INPUT_MESSAGE_ID, sequence: "1" },
      { id: STALE_OUTPUT_MESSAGE_ID, sequence: "2" },
    ];
    target.connection.queue(
      [], // GUCs
      [], // tenant/client advisory lock
      [stale], // initial idempotency lookup
      sequences,
      [{ thread_id: THREAD_ID }], // owner envelope lock
      [stale], // stale run lock and cutoff recheck
      [{ id: STALE_OUTPUT_MESSAGE_ID }],
      [{ id: STALE_RUN_ID }],
      [failed], // terminal replay
      sequences,
    );
    const repository = new SqlAtlasThreadRepository(target.db);

    const replayed = await repository.createThreadAndBeginRun(scope(), {
      threadId: "30000000-0000-4000-8000-000000000099",
      title: null,
      retentionPolicyId: "atlas-default-30d-v1",
      expiresAt: new Date("2026-08-22T10:00:00.000Z"),
      runId: "40000000-0000-4000-8000-000000000099",
      clientRequestId: STALE_CLIENT_REQUEST_ID,
      inputMessageId: "60000000-0000-4000-8000-000000000099",
      outputMessageId: "60000000-0000-4000-8000-000000000100",
      inputContentBlocks: [{ type: "text", text: "exact retry" }],
      startedAt: NOW,
      staleBefore: STALE_BEFORE,
    });

    expect(replayed).toMatchObject({
      replayed: true,
      recoveredStaleRun: true,
      run: {
        runId: STALE_RUN_ID,
        threadId: THREAD_ID,
        status: "failed",
        terminalErrorClass: "process_interrupted",
      },
      inputSequence: "1",
      outputSequence: "2",
    });
    const sql = target.connection.queries.map((query) => query.sql);
    expect(sql.filter((value) =>
      value.startsWith("UPDATE master.atlas_message")
    )).toHaveLength(1);
    expect(sql.filter((value) =>
      value.startsWith("UPDATE event.atlas_run")
    )).toHaveLength(1);
    expect(sql.some((value) =>
      value.includes("INSERT INTO master.conversation")
      || value.includes("INSERT INTO event.atlas_run")
    )).toBe(false);
  });

  it("replays an initial run after the tenant/client advisory lock and scoped recheck", async () => {
    const target = database();
    target.connection.queue(
      [], // GUCs
      [], // tenant/client advisory lock
      [runRow()],
      [
        { id: INPUT_MESSAGE_ID, sequence: "11" },
        { id: OUTPUT_MESSAGE_ID, sequence: "12" },
      ],
    );
    const repository = new SqlAtlasThreadRepository(target.db);

    const existing = await repository.createThreadAndBeginRun(scope(), {
      threadId: "30000000-0000-4000-8000-000000000099",
      title: null,
      retentionPolicyId: "atlas-default-30d-v1",
      expiresAt: new Date("2026-08-22T10:00:00.000Z"),
      runId: "40000000-0000-4000-8000-000000000099",
      clientRequestId: CLIENT_REQUEST_ID,
      inputMessageId: "60000000-0000-4000-8000-000000000099",
      outputMessageId: "60000000-0000-4000-8000-000000000100",
      inputContentBlocks: [{ type: "text", text: "retry" }],
      startedAt: NOW,
      staleBefore: new Date("2026-07-23T09:45:00.000Z"),
    });

    expect(existing).toMatchObject({
      replayed: true,
      run: {
        runId: RUN_ID,
        threadId: THREAD_ID,
        principalId: PRINCIPAL_ID,
        plane: "neon",
      },
      inputSequence: "11",
      outputSequence: "12",
    });
    const advisoryLock = target.connection.queries[1]!;
    expect(advisoryLock.sql).toContain("pg_advisory_xact_lock");
    expect(advisoryLock.sql).toContain("hashtextextended");
    expect(advisoryLock.parameters).toContain(
      `${TENANT_ID}:${CLIENT_REQUEST_ID}`,
    );
    const preflight = target.connection.queries[2]!;
    expect(preflight.sql).toContain("r.tenant_id =");
    expect(preflight.sql).toContain("r.plane =");
    expect(preflight.sql).toContain("r.principal_id =");
    expect(preflight.sql).toContain("r.client_request_id =");
    expect(preflight.parameters).toEqual(expect.arrayContaining([
      TENANT_ID,
      "neon",
      PRINCIPAL_ID,
      CLIENT_REQUEST_ID,
    ]));
    const sequences = target.connection.queries[3]!;
    expect(sequences.sql).toContain("FROM master.atlas_message");
    expect(sequences.sql).toContain("tenant_id =");
    expect(sequences.sql).toContain("plane =");
    expect(target.connection.queries.some((query) =>
      query.sql.includes("INSERT INTO master.conversation")
    )).toBe(false);
    expect(target.connection.queries.some((query) =>
      query.sql.startsWith("UPDATE master.atlas_message")
      || query.sql.startsWith("UPDATE event.atlas_run")
    )).toBe(false);
    expect(target.driver.beginCount).toBe(1);
    expect(target.driver.commitCount).toBe(1);
    expect(target.driver.rollbackCount).toBe(0);
  });

  it("creates the initial thread, owner, messages, and run in the locked transaction", async () => {
    const target = database();
    target.connection.queue(
      [], // GUCs
      [], // tenant/client advisory lock
      [], // scoped idempotency recheck
      [], // conversation
      [], // atlas thread
      [], // owner participant
      [{ sequence: "1" }],
      [{ sequence: "2" }],
      [runRow()],
    );
    const repository = new SqlAtlasThreadRepository(target.db);

    const created = await repository.createThreadAndBeginRun(scope(), {
      threadId: THREAD_ID,
      title: null,
      retentionPolicyId: "atlas-default-30d-v1",
      expiresAt: new Date("2026-08-22T10:00:00.000Z"),
      runId: RUN_ID,
      clientRequestId: CLIENT_REQUEST_ID,
      inputMessageId: INPUT_MESSAGE_ID,
      outputMessageId: OUTPUT_MESSAGE_ID,
      inputContentBlocks: [{ type: "text", text: "first request" }],
      startedAt: NOW,
      staleBefore: new Date("2026-07-23T09:45:00.000Z"),
    });

    expect(created).toMatchObject({
      replayed: false,
      run: {
        runId: RUN_ID,
        threadId: THREAD_ID,
      },
      inputSequence: "1",
      outputSequence: "2",
    });
    const sql = target.connection.queries.map((query) => query.sql);
    const lockIndex = sql.findIndex((value) =>
      value.includes("pg_advisory_xact_lock")
    );
    const recheckIndex = sql.findIndex((value) =>
      value.includes("r.client_request_id =")
    );
    const conversationIndex = sql.findIndex((value) =>
      value.includes("INSERT INTO master.conversation (")
    );
    const threadIndex = sql.findIndex((value) =>
      value.includes("INSERT INTO master.atlas_thread")
    );
    const participantIndex = sql.findIndex((value) =>
      value.includes("INSERT INTO master.conversation_participant")
    );
    const inputIndex = sql.findIndex((value) =>
      value.includes("INSERT INTO master.atlas_message")
      && value.includes("'user'")
    );
    const outputIndex = sql.findIndex((value) =>
      value.includes("INSERT INTO master.atlas_message")
      && value.includes("'assistant'")
    );
    const runIndex = sql.findIndex((value) =>
      value.includes("INSERT INTO event.atlas_run")
    );
    expect(lockIndex).toBeGreaterThan(0);
    expect(recheckIndex).toBeGreaterThan(lockIndex);
    expect(conversationIndex).toBeGreaterThan(recheckIndex);
    expect(threadIndex).toBeGreaterThan(conversationIndex);
    expect(participantIndex).toBeGreaterThan(threadIndex);
    expect(inputIndex).toBeGreaterThan(participantIndex);
    expect(outputIndex).toBeGreaterThan(inputIndex);
    expect(runIndex).toBeGreaterThan(outputIndex);
    expect(target.driver.beginCount).toBe(1);
    expect(target.driver.commitCount).toBe(1);
    expect(target.driver.rollbackCount).toBe(0);
  });

  it("terminalizes assistant and run in one scoped transaction", async () => {
    const target = database();
    target.connection.queue(
      [],
      [runRow()],
      [{ id: OUTPUT_MESSAGE_ID }],
      [{
        ...runRow(),
        status: "failed",
        terminal_at: NOW,
        terminal_error_class: "provider_timeout",
      }],
    );
    const repository = new SqlAtlasThreadRepository(target.db);

    const terminal = await repository.failRun(scope(), {
      runId: RUN_ID,
      terminalErrorClass: "provider_timeout",
      terminalAt: NOW,
    });

    expect(terminal?.status).toBe("failed");
    const sql = target.connection.queries.map((query) => query.sql);
    const messageUpdate = sql.findIndex((value) =>
      value.startsWith("UPDATE master.atlas_message")
    );
    const runUpdate = sql.findIndex((value) =>
      value.startsWith("UPDATE event.atlas_run")
    );
    expect(messageUpdate).toBeGreaterThan(0);
    expect(runUpdate).toBeGreaterThan(messageUpdate);
    expect(sql[messageUpdate]).toContain("status = $");
    expect(sql[runUpdate]).toContain("status = $");
  });
});

describe("SqlAtlasThreadMaintenanceAuthority", () => {
  it("has no caller-controlled tenant/plane selector and leaves thread actor tenant-local", async () => {
    const target = database();
    target.connection.queue(
      [{ authorized: true }],
      [{ id: THREAD_ID }],
      [{ id: THREAD_ID }],
    );
    const authority = new SqlAtlasThreadMaintenanceAuthority(target.db, {
      authority: "athyperadmin_atlas_maintenance",
      systemPrincipalId: PRINCIPAL_ID,
    });

    await expect(authority.purgeEligible({
      asOf: NOW,
      batchSize: 50,
    })).resolves.toEqual({
      expiredCount: 1,
      purgedCount: 1,
    });

    const sql = target.connection.queries.map((query) => query.sql);
    expect(sql[0]).toContain("athyperadmin_atlas_maintenance");
    expect(sql[0]).toContain("NOT pg_has_role(current_user, 'athyperapp'");
    expect(sql[1]).not.toContain("app.current_tenant_id");
    expect(sql[1]).not.toContain("app.current_atlas_plane");
    expect(sql[1]).toContain("updated_by = NULL");
    expect(sql[2]).toContain("c.deleted_at IS NOT NULL");
    expect(sql[2]).toContain("c.deleted_at <");
  });

  it("rejects an application-role maintenance connection before selecting tenants", async () => {
    const target = database();
    target.connection.queue([{ authorized: false }]);
    const authority = new SqlAtlasThreadMaintenanceAuthority(target.db, {
      authority: "athyperadmin_atlas_maintenance",
      systemPrincipalId: PRINCIPAL_ID,
    });

    await expect(authority.purgeEligible({
      asOf: NOW,
      batchSize: 50,
    })).rejects.toThrow("isolated Atlas maintenance authority");
    expect(target.connection.queries).toHaveLength(1);
  });
});
