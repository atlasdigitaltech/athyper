import { randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

export type TestPlane = "studio" | "neon" | "mesh";

export interface PostgresActorContext {
  readonly tenantId: string;
  readonly principalId: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  /** Override the plane's default application role for a specialized service. */
  readonly role?: string;
}

export interface VerifiedPostgresContext {
  readonly plane: TestPlane;
  readonly tenantId: string;
  readonly principalId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly role: string;
}

export interface PlaneDatabaseConfig {
  readonly plane: TestPlane;
  readonly connectionString: string;
  readonly expectedRole: string;
}

export interface PlaneRlsFixture {
  readonly plane: TestPlane;
  readonly tenantId: string;
  readonly principalId: string;
  readonly otherTenantId: string;
  readonly otherPrincipalId: string;
}

export interface TransactionBarrier {
  readonly participants: number;
  readonly arriveAndWait: () => Promise<void>;
}

const PLANES = ["studio", "neon", "mesh"] as const;
const URL_VARIABLES: Readonly<Record<TestPlane, string>> = {
  studio: "ATHYPER_STUDIO_TEST_DATABASE_URL",
  neon: "ATHYPER_NEON_TEST_DATABASE_URL",
  mesh: "ATHYPER_MESH_TEST_DATABASE_URL",
};

const ROLE_VARIABLES: Readonly<Record<TestPlane, string>> = {
  studio: "ATHYPER_STUDIO_TEST_DATABASE_ROLE",
  neon: "ATHYPER_NEON_TEST_DATABASE_ROLE",
  mesh: "ATHYPER_MESH_TEST_DATABASE_ROLE",
};

const DATABASE_NAMES: Readonly<Record<TestPlane, string>> = {
  studio: "athyper_studio",
  neon: "athyper_neon",
  mesh: "athyper_mesh",
};

const DEFAULT_FIXTURE_IDS = Object.freeze({
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  otherTenantId: "55555555-5555-4555-8555-555555555555",
  otherPrincipalId: "66666666-6666-4666-8666-666666666666",
});

export function postgresServiceTestsEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment["ATHYPER_SERVICE_DB_TESTS"] === "true";
}

export function assertPostgresQualificationEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  if (!postgresServiceTestsEnabled(environment)) {
    throw new Error("ATHYPER_SERVICE_DB_TESTS=true is required; use test:service-postgres:local for the explicit local skip path");
  }
  const required = [
    ...PLANES.flatMap((plane) => [URL_VARIABLES[plane], ROLE_VARIABLES[plane]]),
    "ATHYPER_SERVICE_TEST_TENANT_ID",
    "ATHYPER_SERVICE_TEST_PRINCIPAL_ID",
    "ATHYPER_SERVICE_TEST_OTHER_TENANT_ID",
    "ATHYPER_SERVICE_TEST_OTHER_PRINCIPAL_ID",
  ];
  const missing = required.filter((key) => !environment[key]?.trim());
  if (missing.length > 0) throw new Error(`PostgreSQL qualification is missing required environment variables: ${missing.join(", ")}`);
}

export function loadPlaneTestDatabases(environment: NodeJS.ProcessEnv = process.env): readonly PlaneDatabaseConfig[] {
  if (!postgresServiceTestsEnabled(environment)) return [];
  return PLANES.map((plane) => {
    const urlVariable = URL_VARIABLES[plane];
    const roleVariable = ROLE_VARIABLES[plane];
    const connectionString = environment[urlVariable]?.trim();
    const expectedRole = environment[roleVariable]?.trim();
    if (!connectionString) throw new Error(`${urlVariable} is required when ATHYPER_SERVICE_DB_TESTS=true`);
    if (!expectedRole) throw new Error(`${roleVariable} is required when ATHYPER_SERVICE_DB_TESTS=true`);
    assertRoleName(expectedRole);
    return { plane, connectionString, expectedRole };
  });
}

export function loadPlaneRlsFixtures(environment: NodeJS.ProcessEnv = process.env): Readonly<Record<TestPlane, PlaneRlsFixture>> {
  const ids = {
    tenantId: environment["ATHYPER_SERVICE_TEST_TENANT_ID"]?.trim() || DEFAULT_FIXTURE_IDS.tenantId,
    principalId: environment["ATHYPER_SERVICE_TEST_PRINCIPAL_ID"]?.trim() || DEFAULT_FIXTURE_IDS.principalId,
    otherTenantId: environment["ATHYPER_SERVICE_TEST_OTHER_TENANT_ID"]?.trim() || DEFAULT_FIXTURE_IDS.otherTenantId,
    otherPrincipalId: environment["ATHYPER_SERVICE_TEST_OTHER_PRINCIPAL_ID"]?.trim() || DEFAULT_FIXTURE_IDS.otherPrincipalId,
  };
  for (const [name, value] of Object.entries(ids)) assertUuid(value, name);
  return Object.freeze(Object.fromEntries(PLANES.map((plane) => [plane, Object.freeze({ plane, ...ids })])) as Record<TestPlane, PlaneRlsFixture>);
}

export const postgresRlsFixtures = loadPlaneRlsFixtures();

export class PostgresServiceHarness {
  private readonly pools = new Map<TestPlane, Pool>();

  constructor(readonly databases: readonly PlaneDatabaseConfig[] = loadPlaneTestDatabases()) {
    for (const database of databases) {
      this.pools.set(database.plane, new Pool({ connectionString: database.connectionString, max: 8 }));
    }
  }

  async withTenantTransaction<T>(plane: TestPlane, actor: PostgresActorContext, work: (client: PoolClient, context: VerifiedPostgresContext) => Promise<T>): Promise<T> {
    return this.withTenantBoundary(plane, actor, work, true);
  }

  async withTenantRollback<T>(plane: TestPlane, actor: PostgresActorContext, work: (client: PoolClient, context: VerifiedPostgresContext) => Promise<T>): Promise<T> {
    return this.withTenantBoundary(plane, actor, work, false);
  }

  async withTwoTenantTransactions<Left, Right>(
    plane: TestPlane,
    leftActor: PostgresActorContext,
    rightActor: PostgresActorContext,
    leftWork: (client: PoolClient, context: VerifiedPostgresContext, barrier: TransactionBarrier) => Promise<Left>,
    rightWork: (client: PoolClient, context: VerifiedPostgresContext, barrier: TransactionBarrier) => Promise<Right>,
    commit = false,
  ): Promise<readonly [Left, Right]> {
    const barrier = createTwoTransactionBarrier();
    const [left, right] = await Promise.all([
      this.withTenantBoundary(plane, leftActor, (client, context) => leftWork(client, context, barrier), commit),
      this.withTenantBoundary(plane, rightActor, (client, context) => rightWork(client, context, barrier), commit),
    ]);
    return [left, right];
  }

  private async withTenantBoundary<T>(
    plane: TestPlane,
    actor: PostgresActorContext,
    work: (client: PoolClient, context: VerifiedPostgresContext) => Promise<T>,
    commit: boolean,
  ): Promise<T> {
    const config = this.databases.find((entry) => entry.plane === plane);
    const pool = this.pools.get(plane);
    if (!config || !pool) throw new Error(`PostgreSQL service tests are not configured for ${plane}`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const context = await applyAndVerifyContext(client, config, actor);
      const result = await work(client, context);
      await client.query(commit ? "COMMIT" : "ROLLBACK");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await Promise.all([...this.pools.values()].map((pool) => pool.end()));
  }
}

async function applyAndVerifyContext(client: PoolClient, config: PlaneDatabaseConfig, actor: PostgresActorContext): Promise<VerifiedPostgresContext> {
  assertUuid(actor.tenantId, "tenantId");
  assertUuid(actor.principalId, "principalId");
  const requestId = actor.requestId ?? randomUUID();
  const correlationId = actor.correlationId ?? randomUUID();
  assertUuid(requestId, "requestId");
  assertUuid(correlationId, "correlationId");
  const role = actor.role ?? config.expectedRole;
  assertRoleName(role);

  const physical = await client.query<{ current_database: string; database_plane: string; can_assume_role: boolean }>(
    "SELECT current_database(), current_setting('app.database_plane', true) AS database_plane, pg_has_role(session_user, $1, 'USAGE') AS can_assume_role",
    [role],
  );
  const identity = physical.rows[0];
  if (!identity) throw new Error(`Unable to inspect PostgreSQL identity for ${config.plane}`);
  if (identity.current_database !== DATABASE_NAMES[config.plane]) {
    throw new Error(`Wrong physical database: expected ${DATABASE_NAMES[config.plane]}, received ${identity.current_database}`);
  }
  if (identity.database_plane !== config.plane) {
    throw new Error(`Wrong physical plane: expected ${config.plane}, received ${identity.database_plane || "unset"}`);
  }
  if (!identity.can_assume_role) throw new Error(`Database login cannot assume required application role ${role}`);

  await client.query(`SET LOCAL ROLE ${role}`);
  await client.query(
    "SELECT set_config('app.database_plane', $1, true), set_config('app.current_tenant_id', $2, true), set_config('app.current_principal_id', $3, true), set_config('app.current_request_id', $4, true), set_config('app.current_correlation_id', $5, true), set_config('app.current_plane_key', $1, true)",
    [config.plane, actor.tenantId, actor.principalId, requestId, correlationId],
  );
  const verified = await client.query<{ role: string; plane: string; tenant_id: string; principal_id: string; request_id: string; correlation_id: string }>(
    "SELECT current_user AS role, current_setting('app.database_plane', true) AS plane, current_setting('app.current_tenant_id', true) AS tenant_id, current_setting('app.current_principal_id', true) AS principal_id, current_setting('app.current_request_id', true) AS request_id, current_setting('app.current_correlation_id', true) AS correlation_id",
  );
  const row = verified.rows[0];
  const expected = { role, plane: config.plane, tenant_id: actor.tenantId, principal_id: actor.principalId, request_id: requestId, correlation_id: correlationId };
  for (const [key, value] of Object.entries(expected)) {
    if (row?.[key as keyof typeof row] !== value) throw new Error(`PostgreSQL context verification failed for ${key}`);
  }
  return { plane: config.plane, tenantId: actor.tenantId, principalId: actor.principalId, requestId, correlationId, role };
}

export function createTransactionBarrier(participants: number): TransactionBarrier {
  if (!Number.isInteger(participants) || participants < 2) throw new Error("participants must be at least two");
  let arrived = 0;
  let release!: () => void;
  const open = new Promise<void>((resolve) => { release = resolve; });
  return {
    participants,
    arriveAndWait: async () => {
      arrived += 1;
      if (arrived > participants) throw new Error("transaction barrier received too many participants");
      if (arrived === participants) release();
      await open;
    },
  };
}

export function createTwoTransactionBarrier(): TransactionBarrier {
  return createTransactionBarrier(2);
}

export async function runDuplicateCommandRace<T>(work: (attempt: number) => Promise<T>, participants = 2): Promise<readonly PromiseSettledResult<T>[]> {
  const barrier = createTransactionBarrier(participants);
  return Promise.allSettled(Array.from({ length: participants }, async (_, attempt) => {
    await barrier.arriveAndWait();
    return work(attempt);
  }));
}

export async function setLockTimeout(client: PoolClient, milliseconds: number): Promise<void> {
  if (!Number.isInteger(milliseconds) || milliseconds < 1) throw new Error("lock timeout must be a positive integer");
  await client.query("SELECT set_config('lock_timeout', $1, true)", [`${milliseconds}ms`]);
}

export class InjectedWorkerCrashError extends Error {
  constructor(readonly crashPoint: string) {
    super(`Injected worker crash at ${crashPoint}`);
    this.name = "InjectedWorkerCrashError";
  }
}

export function createWorkerCrashController(crashAt: string | readonly string[] | undefined): {
  readonly hits: readonly string[];
  readonly hit: (point: string) => void;
} {
  const configured = new Set(typeof crashAt === "string" ? [crashAt] : crashAt ?? []);
  const hits: string[] = [];
  return {
    hits,
    hit: (point) => {
      if (!point.trim()) throw new Error("worker crash point must not be empty");
      hits.push(point);
      if (configured.has(point)) throw new InjectedWorkerCrashError(point);
    },
  };
}

export function createControlledClock(initial: string): {
  readonly now: () => Date;
  readonly set: (value: string) => void;
  readonly advance: (milliseconds: number) => void;
} {
  let instant = parseInstant(initial, "initial");
  return {
    now: () => new Date(instant),
    set: (value) => { instant = parseInstant(value, "value"); },
    advance: (milliseconds) => {
      if (!Number.isFinite(milliseconds)) throw new Error("milliseconds must be finite");
      instant = new Date(instant.getTime() + milliseconds);
    },
  };
}

export async function setDatabaseTestTime(client: PoolClient, value: string): Promise<void> {
  await client.query("SELECT set_config('app.test_now', $1, true)", [parseInstant(value, "value").toISOString()]);
}

export async function assertNoCrossTenantRows(client: PoolClient, qualifiedTable: string, otherTenantId: string): Promise<void> {
  assertQualifiedName(qualifiedTable);
  const result = await client.query(`SELECT 1 FROM ${qualifiedTable} WHERE tenant_id = $1::uuid LIMIT 1`, [otherTenantId]);
  if (result.rowCount !== 0) throw new Error(`Cross-tenant row was visible in ${qualifiedTable}`);
}

export async function readOutboxEvidence(client: PoolClient, correlationId: string): Promise<readonly QueryResultRow[]> {
  return (await client.query("SELECT id, event_type, aggregate_type, aggregate_id, payload FROM event.outbox WHERE correlation_id = $1::uuid ORDER BY created_at, id", [correlationId])).rows;
}

export async function readAuditEvidence(client: PoolClient, correlationId: string): Promise<readonly QueryResultRow[]> {
  return (await client.query("SELECT id, event_code, entity_type, entity_id, outcome FROM audit.audit_log WHERE correlation_id = $1::uuid ORDER BY occurred_at, id", [correlationId])).rows;
}

export async function assertAuditOutboxEvidence(
  client: PoolClient,
  correlationId: string,
  expected: { readonly audit?: number; readonly outbox?: number } = {},
): Promise<{ readonly audit: readonly QueryResultRow[]; readonly outbox: readonly QueryResultRow[] }> {
  const [audit, outbox] = await Promise.all([readAuditEvidence(client, correlationId), readOutboxEvidence(client, correlationId)]);
  const auditMinimum = expected.audit ?? 1;
  const outboxMinimum = expected.outbox ?? 1;
  if (audit.length < auditMinimum) throw new Error(`Expected at least ${auditMinimum} audit rows for ${correlationId}, received ${audit.length}`);
  if (outbox.length < outboxMinimum) throw new Error(`Expected at least ${outboxMinimum} outbox rows for ${correlationId}, received ${outbox.length}`);
  return { audit, outbox };
}

export async function assertReconciledQueries(
  client: PoolClient,
  sourceSql: string,
  projectionSql: string,
  parameters: readonly unknown[] = [],
): Promise<void> {
  const [source, projection] = await Promise.all([
    client.query(sourceSql, [...parameters]),
    client.query(projectionSql, [...parameters]),
  ]);
  const normalize = (rows: readonly QueryResultRow[]) => JSON.stringify(rows);
  if (normalize(source.rows) !== normalize(projection.rows)) {
    throw new Error(`Reconciliation mismatch: source=${JSON.stringify(source.rows)} projection=${JSON.stringify(projection.rows)}`);
  }
}

export async function assertRowCount(client: PoolClient, qualifiedTable: string, expected: number, whereSql = "TRUE", parameters: readonly unknown[] = []): Promise<void> {
  assertQualifiedName(qualifiedTable);
  if (!Number.isInteger(expected) || expected < 0) throw new Error("expected row count must be a non-negative integer");
  if (/[;]|--|\/\*/.test(whereSql)) throw new Error("Unsafe reconciliation predicate");
  const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${qualifiedTable} WHERE ${whereSql}`, [...parameters]);
  const actual = Number(result.rows[0]?.count ?? -1);
  if (actual !== expected) throw new Error(`Expected ${expected} rows in ${qualifiedTable}, received ${actual}`);
}

export function uniqueTestId(): string { return randomUUID(); }

function parseInstant(value: string, name: string): Date {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error(`${name} must be an ISO timestamp`);
  return instant;
}

function assertRoleName(value: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Invalid PostgreSQL role name: ${value}`);
}

function assertQualifiedName(value: string): void {
  if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Invalid qualified table name");
}

function assertUuid(value: string, name: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${name} must be a UUID`);
}
