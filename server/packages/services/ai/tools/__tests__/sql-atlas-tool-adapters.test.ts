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
import type {
  EffectivePermissionContext,
  PermissionResolverRegistry,
  PlaneKey,
  VerifiedRequestContext,
} from "@athyper/svc-iam";
import { describe, expect, it, vi } from "vitest";
import type { AnyDb } from "../../ai-runtime.types.js";
import {
  ATLAS_TOOL_EVIDENCE_SCHEMA_VERSION,
  ATLAS_TOOL_EXECUTION_RECORD_SCHEMA_VERSION,
  ATLAS_TOOL_MANIFEST_SCHEMA_VERSION,
  type AtlasToolAuthorizationResolution,
  type AtlasToolExecutionProposal,
  type AtlasToolExecutionScope,
  type AtlasToolExecutionTerminal,
  type AtlasToolExecutingTransition,
} from "../atlas-tool.types.js";
import {
  SqlAtlasToolAuthorizationRevalidator,
} from "../sql-atlas-tool-authorization-revalidator.js";
import {
  SqlAtlasToolExecutionRecorder,
  SqlAtlasToolExecutionRecorderError,
} from "../sql-atlas-tool-execution-recorder.js";
import {
  SqlAtlasToolInvocationMaintenanceAuthority,
} from "../sql-atlas-tool-invocation-maintenance.js";
import {
  SqlAtlasToolInvocationRecoveryAdminService,
} from "../sql-atlas-tool-invocation-recovery.service.js";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL_ID = "20000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const RUN_ID = "40000000-0000-4000-8000-000000000001";
const EXECUTION_ID = "50000000-0000-4000-8000-000000000001";
const ACCOUNT_GRANT_ID = "60000000-0000-4000-8000-000000000001";
const CALL_ID = "call-1";
const TOOL_NAME = "atlas_catalog_help";
const TOOL_VERSION = "1.0.0";
const ACTION_CODE = "atlas_tool_read";
const READ_PERMISSION = "ai.agent.tool.read";
const ARGUMENT_HASH = "a".repeat(64);
const RESULT_HASH = "b".repeat(64);
const NOW = new Date("2026-07-24T10:00:00.000Z");

interface CapturedQuery {
  sql: string;
  parameters: readonly unknown[];
}

class FakeConnection implements DatabaseConnection {
  readonly queries: CapturedQuery[] = [];
  readonly results: Array<unknown[] | Error> = [];

  queue(...results: Array<unknown[] | Error>): void {
    this.results.push(...results);
  }

  async executeQuery<R>(
    compiledQuery: CompiledQuery,
  ): Promise<QueryResult<R>> {
    this.queries.push({
      sql: compiledQuery.sql.replace(/\s+/g, " ").trim(),
      parameters: compiledQuery.parameters,
    });
    const result = this.results.shift() ?? [];
    if (result instanceof Error) throw result;
    return { rows: result as R[] };
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

function executionScope(
  overrides: Partial<AtlasToolExecutionScope> = {},
): AtlasToolExecutionScope {
  return {
    executionId: EXECUTION_ID,
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    plane: "neon",
    runId: RUN_ID,
    threadId: THREAD_ID,
    callId: CALL_ID,
    ...overrides,
  };
}

function resolution(
  overrides: Partial<AtlasToolAuthorizationResolution> = {},
): AtlasToolAuthorizationResolution {
  return {
    toolVersion: TOOL_VERSION,
    actionCode: ACTION_CODE,
    operationClass: "read",
    riskClass: "low",
    autonomyDecision: "auto",
    permissionSnapshot: {
      resolution: "resolved",
      requiredPermissions: [READ_PERMISSION],
      granted: true,
      profileHash: "profile-v1",
    },
    policySnapshot: {
      resolution: "resolved",
      autonomyLevel: "auto",
      requiresHumanConfirmation: false,
      confidenceThreshold: 0.9,
      riskCeiling: "high",
    },
    profileSnapshot: {
      profileHash: "profile-v1",
      schemaHash: "schema-v1",
      plane: "neon",
    },
    authorizationEpoch: 7,
    policyRevision: "policy-v1",
    profileRevision: "profile-v1",
    proposalSummary: {
      runtimeDisposition: "described",
      gate: "eligible",
      handlerEligible: true,
    },
    ...overrides,
  };
}

function proposal(
  overrides: Partial<AtlasToolExecutionProposal> = {},
): AtlasToolExecutionProposal {
  return {
    schemaVersion: ATLAS_TOOL_EXECUTION_RECORD_SCHEMA_VERSION,
    ...executionScope(),
    authorizationProfileHash: "profile-v1",
    authorizationEpoch: 7,
    toolName: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    actionCode: ACTION_CODE,
    operationClass: "unresolved",
    riskClass: "unknown",
    autonomyDecision: "not_evaluated",
    permissionSnapshot: {
      resolution: "not_evaluated",
      requiredPermissions: [READ_PERMISSION],
      granted: null,
      profileHash: "profile-v1",
    },
    policySnapshot: {
      resolution: "not_evaluated",
      autonomyLevel: "disabled",
      requiresHumanConfirmation: true,
      confidenceThreshold: null,
      riskCeiling: null,
    },
    profileSnapshot: {
      profileHash: "profile-v1",
      schemaHash: "schema-v1",
      plane: "neon",
    },
    policyRevision: "unresolved",
    profileRevision: "profile-v1",
    proposalSummary: {
      runtimeDisposition: "described",
      gate: "not_evaluated",
      handlerEligible: false,
    },
    argumentHash: ARGUMENT_HASH,
    proposedAt: NOW,
    ...overrides,
  };
}

function unresolvedResolution(): AtlasToolAuthorizationResolution {
  const initial = proposal();
  return {
    toolVersion: initial.toolVersion,
    actionCode: initial.actionCode,
    operationClass: initial.operationClass,
    riskClass: initial.riskClass,
    autonomyDecision: initial.autonomyDecision,
    permissionSnapshot: initial.permissionSnapshot,
    policySnapshot: initial.policySnapshot,
    profileSnapshot: initial.profileSnapshot,
    authorizationEpoch: initial.authorizationEpoch,
    policyRevision: initial.policyRevision,
    profileRevision: initial.profileRevision,
    proposalSummary: initial.proposalSummary,
  };
}

function executingTransition(): AtlasToolExecutingTransition {
  return {
    scope: executionScope(),
    resolution: resolution(),
    executionGuardSnapshot: {
      manifestSchemaVersion: ATLAS_TOOL_MANIFEST_SCHEMA_VERSION,
      toolVersion: TOOL_VERSION,
      actionCode: ACTION_CODE,
      access: "read_only",
      risk: "low",
      featureKey: "atlas.tools.catalog_help",
      requiredPermissions: [READ_PERMISSION],
      idempotency: { mode: "none" },
      confirmation: { mode: "none" },
      stepUp: { mode: "none" },
      dualControl: { mode: "none" },
      implementation: {
        kind: "code",
        binding: "atlas.catalog.help/v1",
      },
      audit: {
        lifecycle: "proposed_executing_terminal",
        arguments: "sha256",
        results: "sha256",
        contentStorage: "forbidden",
      },
      evidence: {
        mode: "code_source",
        requireVersion: true,
        requireChecksumForCode: true,
      },
      argumentHash: ARGUMENT_HASH,
    },
    executingAt: new Date(NOW.getTime() + 10),
  };
}

function terminal(
  overrides: Partial<AtlasToolExecutionTerminal> = {},
): AtlasToolExecutionTerminal {
  return {
    scope: executionScope(),
    resolution: resolution(),
    outcome: "completed",
    errorCode: null,
    resultHash: RESULT_HASH,
    evidence: [{
      schemaVersion: ATLAS_TOOL_EVIDENCE_SCHEMA_VERSION,
      kind: "code",
      sourceId: "atlas.catalog.help",
      sourceVersionId: "2026-07-24",
      sourceChecksum: `sha256:${"c".repeat(64)}`,
    }],
    completedAt: new Date(NOW.getTime() + 20),
    durationMs: 20,
    ...overrides,
  };
}

describe("SqlAtlasToolExecutionRecorder", () => {
  it("rejects statement timeouts outside the bounded adapter range", () => {
    expect(() => new SqlAtlasToolExecutionRecorder(database().db, {
      statementTimeoutMs: 99,
    })).toThrow(/audit record is invalid/);
  });

  it("binds content-free proposal values and stamps every RLS scope dimension", async () => {
    const target = database();
    target.connection.queue([], [{ state: "inserted" }]);
    const recorder = new SqlAtlasToolExecutionRecorder(target.db);
    const hostileCallId = "call-1'; DROP TABLE ai.ai_tool_invocation; --";

    await recorder.propose(proposal({ callId: hostileCallId }));

    const guc = target.connection.queries[0]!;
    expect(guc.sql).toContain("app.current_tenant_id");
    expect(guc.sql).toContain("app.current_principal_id");
    expect(guc.sql).toContain("app.current_atlas_plane");
    expect(guc.sql).toContain("statement_timeout");
    expect(guc.parameters).toEqual(
      expect.arrayContaining([TENANT_ID, PRINCIPAL_ID, "neon", "1500"]),
    );
    const insert = target.connection.queries[1]!;
    expect(insert.sql).toContain("INSERT INTO ai.ai_tool_invocation");
    expect(insert.sql).toContain(
      "ON CONFLICT (tenant_id, run_id, tool_call_id) DO NOTHING",
    );
    expect(insert.sql).not.toContain(hostileCallId);
    expect(insert.parameters).toContain(hostileCallId);
    expect(insert.sql).not.toMatch(/\b(raw_arguments|raw_result|prompt|token)\b/i);
    expect(target.driver.commitCount).toBe(1);
  });

  it("accepts only an exact still-proposed replay and rejects conflict state", async () => {
    const same = database();
    same.connection.queue([], [{ state: "matched" }]);
    await expect(
      new SqlAtlasToolExecutionRecorder(same.db).propose(proposal()),
    ).resolves.toBeUndefined();
    const replaySql = same.connection.queries[1]!.sql;
    expect(replaySql).toContain("i.id =");
    expect(replaySql).toContain("i.input_hash IS NOT DISTINCT FROM");
    expect(replaySql).toContain("i.status = 'proposed'");

    const mismatch = database();
    mismatch.connection.queue([], [{ state: "conflict" }]);
    await expect(
      new SqlAtlasToolExecutionRecorder(mismatch.db).propose(proposal()),
    ).rejects.toMatchObject({
      name: "SqlAtlasToolExecutionRecorderError",
      code: "PROPOSAL_CONFLICT",
    });
    expect(mismatch.driver.rollbackCount).toBe(1);
  });

  it("marks executing with full scope, input hash, and legal source status", async () => {
    const target = database();
    target.connection.queue([], [{ id: EXECUTION_ID }]);
    const recorder = new SqlAtlasToolExecutionRecorder(target.db);

    await recorder.markExecuting(executingTransition());

    const update = target.connection.queries[1]!;
    expect(update.sql).toContain("UPDATE ai.ai_tool_invocation");
    for (const predicate of [
      "id =",
      "tenant_id =",
      "principal_id =",
      "plane =",
      "run_id =",
      "thread_id =",
      "tool_call_id =",
      "input_hash =",
      "status = 'proposed'",
    ]) {
      expect(update.sql).toContain(predicate);
    }
    expect(update.sql).toContain("FROM ai.atlas_run r");
    expect(update.sql).toContain("r.status = 'started'");
    expect(update.parameters).toEqual(expect.arrayContaining([
      EXECUTION_ID,
      TENANT_ID,
      PRINCIPAL_ID,
      RUN_ID,
      THREAD_ID,
      CALL_ID,
      ARGUMENT_HASH,
    ]));
  });

  it("fails closed when a scoped transition updates zero rows", async () => {
    const target = database();
    target.connection.queue([], []);
    await expect(
      new SqlAtlasToolExecutionRecorder(target.db)
        .markExecuting(executingTransition()),
    ).rejects.toMatchObject({
      name: "SqlAtlasToolExecutionRecorderError",
      code: "TRANSITION_CONFLICT",
    });
    expect(target.driver.rollbackCount).toBe(1);
  });

  it("maps denied to the durable denied state and strips failure evidence", async () => {
    const target = database();
    target.connection.queue([], [{ id: EXECUTION_ID }]);
    const deniedResolution = resolution({
      autonomyDecision: "denied",
      proposalSummary: {
        runtimeDisposition: "described",
        gate: "permission_denied",
        handlerEligible: false,
      },
    });
    await new SqlAtlasToolExecutionRecorder(target.db).finalize(terminal({
      resolution: deniedResolution,
      outcome: "denied",
      errorCode: "PERMISSION_DENIED",
      resultHash: null,
      evidence: [{
        schemaVersion: ATLAS_TOOL_EVIDENCE_SCHEMA_VERSION,
        kind: "record",
        sourceId: "must-not-persist",
        sourceVersionId: "v1",
      }],
    }));

    const update = target.connection.queries[1]!;
    expect(update.sql).toContain("status IN ('proposed')");
    expect(update.parameters).toContain("denied");
    expect(update.parameters).toContain("PERMISSION_DENIED");
    expect(update.parameters).toContain("[]");
    expect(update.parameters).not.toContain("must-not-persist");
  });

  it("rejects terminal replay or wrong-source transitions", async () => {
    const target = database();
    target.connection.queue([], []);
    await expect(
      new SqlAtlasToolExecutionRecorder(target.db).finalize(terminal()),
    ).rejects.toBeInstanceOf(SqlAtlasToolExecutionRecorderError);
  });

  it.each([
    ["failed", "HANDLER_FAILED"],
    ["cancelled", "CANCELLED"],
  ] as const)(
    "never persists evidence or a result hash for %s outcomes",
    async (outcome, errorCode) => {
      const target = database();
      target.connection.queue([], [{ id: EXECUTION_ID }]);
      await new SqlAtlasToolExecutionRecorder(target.db).finalize(terminal({
        outcome,
        errorCode,
        resultHash: null,
        evidence: [{
          schemaVersion: ATLAS_TOOL_EVIDENCE_SCHEMA_VERSION,
          kind: "record",
          sourceId: `forbidden-${outcome}-evidence`,
          sourceVersionId: "v1",
        }],
      }));

      const update = target.connection.queries[1]!;
      expect(update.sql).toContain("status IN ('proposed', 'executing')");
      expect(update.parameters).toContain("[]");
      expect(update.parameters).not.toContain(
        `forbidden-${outcome}-evidence`,
      );
      expect(update.parameters).not.toContain(RESULT_HASH);
    },
  );

  it("terminalizes a pre-authorization cancellation without rewriting resolution", async () => {
    const target = database();
    target.connection.queue([], [{ id: EXECUTION_ID }]);
    await new SqlAtlasToolExecutionRecorder(target.db).finalize(terminal({
      resolution: unresolvedResolution(),
      outcome: "cancelled",
      errorCode: "CANCELLED",
      resultHash: null,
      evidence: [],
    }));

    const update = target.connection.queries[1]!;
    expect(update.sql).toContain("SET status =");
    expect(update.sql).not.toContain("SET tool_version =");
    expect(update.sql).toContain("status IN ('proposed')");
  });
});

describe("SqlAtlasToolAuthorizationRevalidator", () => {
  it("rejects statement timeouts outside the bounded adapter range", () => {
    expect(() => new SqlAtlasToolAuthorizationRevalidator(
      database().db,
      permissionRegistry("neon", vi.fn(async () => permissions())),
      { statementTimeoutMs: 30_001 },
    )).toThrow(/statement timeout/);
  });

  it("requires exact epoch plus a live matching permission context", async () => {
    const target = database();
    target.connection.queue([], [{ auth_epoch: "7" }]);
    const live = permissions();
    const build = vi.fn(async () => live);
    const registry = permissionRegistry("neon", build);
    const revalidator = new SqlAtlasToolAuthorizationRevalidator(
      target.db,
      registry,
    );

    await expect(revalidator.isCurrent(context(), {
      requiredPermissions: [READ_PERMISSION],
    })).resolves.toBe(true);

    const epochQuery = target.connection.queries[1]!;
    expect(epochQuery.sql).toContain("p.tenant_id =");
    expect(epochQuery.sql).toContain("p.id =");
    expect(epochQuery.sql).toContain("p.is_active = true");
    expect(epochQuery.sql).toContain("p.is_locked = false");
    expect(epochQuery.parameters).toEqual(
      expect.arrayContaining([TENANT_ID, PRINCIPAL_ID]),
    );
    expect(target.connection.queries[0]!.sql).toContain("statement_timeout");
    expect(target.connection.queries[0]!.parameters).toContain("1500");
    expect(build).toHaveBeenCalledWith({
      planeKey: "neon",
      tenantId: TENANT_ID,
      principalId: PRINCIPAL_ID,
    });
  });

  it.each([
    ["stale", [{ auth_epoch: 8 }]],
    ["missing", []],
    ["malformed", [{ auth_epoch: "7.0" }]],
  ])("fails closed for %s auth epoch state", async (_label, rows) => {
    const target = database();
    target.connection.queue([], rows);
    const build = vi.fn(async () => permissions());
    const revalidator = new SqlAtlasToolAuthorizationRevalidator(
      target.db,
      permissionRegistry("neon", build),
    );

    await expect(revalidator.isCurrent(context(), {
      requiredPermissions: [READ_PERMISSION],
    })).resolves.toBe(false);
    expect(build).not.toHaveBeenCalled();
  });

  it("fails closed on database or live resolver errors", async () => {
    const databaseFailure = database();
    databaseFailure.connection.queue([], new Error("database unavailable"));
    const dbBuild = vi.fn(async () => permissions());
    await expect(
      new SqlAtlasToolAuthorizationRevalidator(
        databaseFailure.db,
        permissionRegistry("neon", dbBuild),
      ).isCurrent(context(), { requiredPermissions: [READ_PERMISSION] }),
    ).resolves.toBe(false);
    expect(dbBuild).not.toHaveBeenCalled();

    const resolverFailure = database();
    resolverFailure.connection.queue([], [{ auth_epoch: 7 }]);
    await expect(
      new SqlAtlasToolAuthorizationRevalidator(
        resolverFailure.db,
        permissionRegistry("neon", vi.fn(async () => {
          throw new Error("resolver unavailable");
        })),
      ).isCurrent(context(), { requiredPermissions: [READ_PERMISSION] }),
    ).resolves.toBe(false);
  });

  it.each([
    ["profile", { profileHash: "profile-v2" }],
    ["schema", { schemaHash: "schema-v2" }],
    ["fingerprint", { principalFingerprint: "principal-v2" }],
  ])("rejects a live %s mismatch", async (_label, overrides) => {
    const target = database();
    target.connection.queue([], [{ auth_epoch: 7 }]);
    const live = permissions(overrides);
    const revalidator = new SqlAtlasToolAuthorizationRevalidator(
      target.db,
      permissionRegistry("neon", vi.fn(async () => live)),
    );
    await expect(revalidator.isCurrent(context(), {
      requiredPermissions: [READ_PERMISSION],
    })).resolves.toBe(false);
  });

  it("rejects revoked required permissions and changed authorization scope", async () => {
    const revokedTarget = database();
    revokedTarget.connection.queue([], [{ auth_epoch: 7 }]);
    const revoked = permissions({
      allowed: new Set(),
      entries: new Map(),
    });
    await expect(
      new SqlAtlasToolAuthorizationRevalidator(
        revokedTarget.db,
        permissionRegistry("neon", vi.fn(async () => revoked)),
      ).isCurrent(context(), { requiredPermissions: [READ_PERMISSION] }),
    ).resolves.toBe(false);

    const scopeTarget = database();
    scopeTarget.connection.queue([], [{ auth_epoch: 7 }]);
    const changedScope = permissions({
      authorizationScopes: new Map([[
        READ_PERMISSION,
        authorizationScope({ visibility: "own" }),
      ]]),
    });
    await expect(
      new SqlAtlasToolAuthorizationRevalidator(
        scopeTarget.db,
        permissionRegistry("neon", vi.fn(async () => changedScope)),
      ).isCurrent(context(), { requiredPermissions: [READ_PERMISSION] }),
    ).resolves.toBe(false);
  });

  it("rebuilds mesh permissions through the immutable account grant", async () => {
    const target = database();
    target.connection.queue([], [{ auth_epoch: 7 }]);
    const live = permissions({
      planeKey: "mesh",
      accountGrantId: ACCOUNT_GRANT_ID,
      personaId: undefined,
      authorizationScopes: new Map(),
    });
    const build = vi.fn(async () => live);
    const revalidator = new SqlAtlasToolAuthorizationRevalidator(
      target.db,
      permissionRegistry("mesh", build),
    );

    await expect(revalidator.isCurrent(context({
      planeKey: "mesh",
      permissions: live,
    }), {
      requiredPermissions: [READ_PERMISSION],
    })).resolves.toBe(true);
    expect(build).toHaveBeenCalledWith({
      planeKey: "mesh",
      tenantId: TENANT_ID,
      principalId: PRINCIPAL_ID,
      accountGrantId: ACCOUNT_GRANT_ID,
    });
  });
});

describe("SqlAtlasToolInvocationMaintenanceAuthority", () => {
  function maintenance() {
    return {
      tenantId: TENANT_ID,
      tenantMaintenancePrincipalId: PRINCIPAL_ID,
      plane: "neon" as const,
      staleBefore: new Date("2026-07-24T09:30:00.000Z"),
      asOf: NOW,
      batchSize: 50,
    };
  }

  it("requires explicit admin authority and a bounded statement timeout", () => {
    const target = database();
    expect(() => new SqlAtlasToolInvocationMaintenanceAuthority(
      target.db,
      { authority: "wrong" as "athyperadmin_atlas_tool_maintenance" },
    )).toThrow(/approved Atlas tool maintenance/);
    expect(() => new SqlAtlasToolInvocationMaintenanceAuthority(
      target.db,
      {
        authority: "athyperadmin_atlas_tool_maintenance",
        statementTimeoutMs: 50,
      },
    )).toThrow(/statement timeout/);
  });

  it("scopes stale recovery to one tenant, plane, batch, age, and safe source states", async () => {
    const target = database();
    target.connection.queue([], [
      { id: EXECUTION_ID },
      { id: "50000000-0000-4000-8000-000000000002" },
    ]);
    const authority = new SqlAtlasToolInvocationMaintenanceAuthority(
      target.db,
      { authority: "athyperadmin_atlas_tool_maintenance" },
    );

    await expect(authority.recoverStale(maintenance())).resolves.toEqual({
      failedCount: 2,
    });

    const guc = target.connection.queries[0]!;
    expect(guc.sql).toContain("statement_timeout");
    expect(guc.parameters).toEqual(expect.arrayContaining([
      TENANT_ID,
      PRINCIPAL_ID,
      "neon",
      "1500",
    ]));
    const recovery = target.connection.queries[1]!;
    for (const guard of [
      "i.tenant_id =",
      "i.plane =",
      "i.status IN ('proposed', 'executing')",
      "i.operation_class IN ('unresolved', 'read')",
      "i.confirmation_required = false",
      "i.created_at <=",
      "COALESCE(i.executing_at, i.created_at) <=",
      "r.status IN ('completed', 'failed', 'cancelled')",
      "r.status = 'started'",
      "r.started_at <=",
      "LIMIT",
      "FOR UPDATE OF i SKIP LOCKED",
    ]) {
      expect(recovery.sql).toContain(guard);
    }
    // The final UPDATE repeats source guards, so terminal invocation rows
    // can never be selected or changed even after candidate locking.
    expect(
      recovery.sql.match(/i\.status IN \('proposed', 'executing'\)/g),
    ).toHaveLength(2);
    expect(recovery.parameters).toEqual(expect.arrayContaining([
      TENANT_ID,
      PRINCIPAL_ID,
      "neon",
      50,
      "process_interrupted",
    ]));
  });

  it("is idempotent when no stale eligible rows remain", async () => {
    const target = database();
    target.connection.queue([], []);
    const authority = new SqlAtlasToolInvocationMaintenanceAuthority(
      target.db,
      { authority: "athyperadmin_atlas_tool_maintenance" },
    );
    await expect(authority.recoverStale(maintenance())).resolves.toEqual({
      failedCount: 0,
    });
  });
});

describe("SqlAtlasToolInvocationRecoveryAdminService", () => {
  function sweep() {
    return {
      staleBefore: new Date("2026-07-24T09:30:00.000Z"),
      asOf: NOW,
      batchSize: 50,
    };
  }

  it("enumerates safe scopes internally and enforces a global row budget", async () => {
    const target = database();
    target.connection.queue(
      [],
      [{ missing_actor_scope_count: 0 }],
      [
        {
          tenant_id: TENANT_ID,
          plane: "neon",
          maintenance_principal_id: PRINCIPAL_ID,
        },
        {
          tenant_id: "10000000-0000-4000-8000-000000000002",
          plane: "mesh",
          maintenance_principal_id:
            "20000000-0000-4000-8000-000000000002",
        },
      ],
    );
    const recoverStale = vi.fn()
      .mockResolvedValueOnce({ failedCount: 40 })
      .mockResolvedValueOnce({ failedCount: 10 });
    const service = new SqlAtlasToolInvocationRecoveryAdminService(
      target.db,
      { recoverStale } as unknown as
        SqlAtlasToolInvocationMaintenanceAuthority,
      { authority: "athyperadmin_atlas_tool_maintenance" },
    );

    await expect(service.recoverEligible(sweep())).resolves.toEqual({
      failedCount: 50,
      scopeCount: 2,
      skippedScopeCount: 0,
    });

    const readiness = target.connection.queries[1]!;
    expect(readiness.sql).toContain("WHERE NOT EXISTS");
    expect(readiness.sql).toContain("p.code = 'atlas.maintenance'");
    const enumeration = target.connection.queries[2]!;
    for (const guard of [
      "i.status IN ('proposed', 'executing')",
      "i.operation_class IN ('unresolved', 'read')",
      "i.confirmation_required = false",
      "i.downstream_command_idempotency_key IS NULL",
      "i.business_transaction_id IS NULL",
      "r.status IN ('completed', 'failed', 'cancelled')",
      "r.status = 'started'",
      "p.code = 'atlas.maintenance'",
      "p.is_service_account = true",
      "LIMIT",
    ]) {
      expect(enumeration.sql).toContain(guard);
    }
    expect(enumeration.sql).toContain("JOIN LATERAL");
    expect(enumeration.sql).not.toContain("LEFT JOIN LATERAL");
    expect(recoverStale).toHaveBeenNthCalledWith(1, expect.objectContaining({
      tenantId: TENANT_ID,
      plane: "neon",
      batchSize: 50,
    }));
    expect(recoverStale).toHaveBeenNthCalledWith(2, expect.objectContaining({
      plane: "mesh",
      batchSize: 10,
    }));
  });

  it("skips scopes without the exact active maintenance actor", async () => {
    const target = database();
    target.connection.queue(
      [],
      [{ missing_actor_scope_count: 1 }],
      [],
    );
    const recoverStale = vi.fn();
    const service = new SqlAtlasToolInvocationRecoveryAdminService(
      target.db,
      { recoverStale } as unknown as
        SqlAtlasToolInvocationMaintenanceAuthority,
      { authority: "athyperadmin_atlas_tool_maintenance" },
    );

    await expect(service.recoverEligible(sweep())).resolves.toEqual({
      failedCount: 0,
      scopeCount: 1,
      skippedScopeCount: 1,
    });
    expect(recoverStale).not.toHaveBeenCalled();
  });

  it("rejects construction without the explicit admin authority", () => {
    const target = database();
    expect(() => new SqlAtlasToolInvocationRecoveryAdminService(
      target.db,
      { recoverStale: vi.fn() } as unknown as
        SqlAtlasToolInvocationMaintenanceAuthority,
      { authority: "wrong" as "athyperadmin_atlas_tool_maintenance" },
    )).toThrow(/approved Atlas tool recovery admin DB authority/);
  });
});

function authorizationScope(
  overrides: Partial<
    EffectivePermissionContext["authorizationScopes"] extends
      ReadonlyMap<string, infer Scope>
      ? Scope
      : never
  > = {},
) {
  return {
    permissionCode: READ_PERMISSION,
    tenantWide: false,
    legalEntityIds: new Set(["70000000-0000-4000-8000-000000000001"]),
    companyCodeIds: new Set(["80000000-0000-4000-8000-000000000001"]),
    operatingOrganizationIds: new Set<string>(),
    networkMembershipIds: new Set<string>(),
    visibility: "all" as const,
    ...overrides,
  };
}

function permissions(
  overrides: Partial<EffectivePermissionContext> = {},
): EffectivePermissionContext {
  return {
    planeKey: "neon",
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    personaId: "90000000-0000-4000-8000-000000000001",
    principalFingerprint: "principal-v1",
    planVersionId: "plan-v1",
    allowed: new Set([READ_PERMISSION]),
    denied: new Set(),
    planLocked: new Set(),
    planeExcluded: new Set(),
    entries: new Map([[
      READ_PERMISSION,
      {
        code: READ_PERMISSION,
        status: "allow",
        reason: "allowed",
      },
    ]]),
    authorizationScopes: new Map([[
      READ_PERMISSION,
      authorizationScope(),
    ]]),
    profileHash: "profile-v1",
    schemaHash: "schema-v1",
    resolvedAt: NOW.getTime(),
    ...overrides,
  };
}

function context(
  overrides: Partial<VerifiedRequestContext> = {},
): VerifiedRequestContext {
  const permissionContext = overrides.permissions ?? permissions();
  return {
    planeKey: permissionContext.planeKey,
    realmKey: "customer",
    tenantId: TENANT_ID,
    principalId: PRINCIPAL_ID,
    permissions: permissionContext,
    authEpoch: 7,
    profileHash: permissionContext.profileHash,
    requestId: "request-v1",
    ...overrides,
  };
}

function permissionRegistry(
  plane: PlaneKey,
  build: (input: {
    planeKey: PlaneKey;
    tenantId: string;
    principalId: string;
    accountGrantId?: string;
  }) => Promise<EffectivePermissionContext>,
): PermissionResolverRegistry {
  return {
    get: vi.fn((requestedPlane: PlaneKey) => ({
      planeKey: requestedPlane === plane ? plane : requestedPlane,
      build,
    })),
  };
}
