import { sql } from "kysely";
import type { PlaneKey } from "@athyper/svc-iam";
import type { AnyDb } from "../ai-runtime.types.js";
import type {
  RecoverStaleAtlasToolInvocationsResult,
  SqlAtlasToolInvocationMaintenanceAuthority,
} from "./sql-atlas-tool-invocation-maintenance.js";

const MAX_BATCH_SIZE = 1_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 1_500;
const PLANES = new Set<PlaneKey>(["neon", "mesh", "admin"]);

interface RecoveryScopeRow {
  tenant_id: string;
  plane: string;
  maintenance_principal_id: string;
}

interface MissingActorCountRow {
  missing_actor_scope_count: number | string;
}

interface RecoveryScopeEnumeration {
  readonly scopes: RecoveryScopeRow[];
  readonly missingActorScopeCount: number;
}

export interface RecoverEligibleAtlasToolInvocationsInput {
  readonly staleBefore: Date;
  readonly asOf: Date;
  readonly batchSize: number;
}

export interface RecoverEligibleAtlasToolInvocationsResult
  extends RecoverStaleAtlasToolInvocationsResult {
  readonly scopeCount: number;
  readonly skippedScopeCount: number;
}

export interface SqlAtlasToolInvocationRecoveryAdminOptions {
  /**
   * Explicit acknowledgement that `systemDb` is the bootstrap-attested
   * athyperadmin maintenance connection, never the application tenant role.
   */
  readonly authority: "athyperadmin_atlas_tool_maintenance";
  readonly statementTimeoutMs?: number;
}

/**
 * Cross-tenant orchestration around the tenant-scoped recovery primitive.
 *
 * Callers provide only an age boundary and a global row budget. This service
 * discovers tenant/plane scopes and an active tenant service principal on the
 * separately-authorized connection. Missing maintenance actors are skipped
 * fail-closed; the tenant-scoped authority repeats all state guards under lock.
 */
export class SqlAtlasToolInvocationRecoveryAdminService {
  private readonly statementTimeoutMs: number;

  constructor(
    private readonly systemDb: AnyDb,
    private readonly authority:
      SqlAtlasToolInvocationMaintenanceAuthority,
    options: SqlAtlasToolInvocationRecoveryAdminOptions,
  ) {
    if (options.authority !== "athyperadmin_atlas_tool_maintenance") {
      throw new Error(
        "An approved Atlas tool recovery admin DB authority is required.",
      );
    }
    const timeout = options.statementTimeoutMs
      ?? DEFAULT_STATEMENT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 30_000) {
      throw new Error("Invalid Atlas tool recovery statement timeout.");
    }
    this.statementTimeoutMs = timeout;
  }

  async recoverEligible(
    input: RecoverEligibleAtlasToolInvocationsInput,
  ): Promise<RecoverEligibleAtlasToolInvocationsResult> {
    validate(input);
    const enumeration = await this.enumerateScopes(input);
    const scopes = enumeration.scopes;

    let failedCount = 0;
    for (const scope of scopes) {
      if (failedCount >= input.batchSize) break;
      const plane = parsePlane(scope.plane);
      if (!plane) {
        continue;
      }

      const result = await this.authority.recoverStale({
        tenantId: scope.tenant_id,
        tenantMaintenancePrincipalId: scope.maintenance_principal_id,
        plane,
        staleBefore: input.staleBefore,
        asOf: input.asOf,
        batchSize: input.batchSize - failedCount,
      });
      failedCount += result.failedCount;
    }

    return Object.freeze({
      failedCount,
      scopeCount: scopes.length + enumeration.missingActorScopeCount,
      skippedScopeCount: enumeration.missingActorScopeCount,
    });
  }

  private async enumerateScopes(
    input: RecoverEligibleAtlasToolInvocationsInput,
  ): Promise<RecoveryScopeEnumeration> {
    return this.systemDb.transaction().execute(async (transaction) => {
      const trx = transaction as unknown as AnyDb;
      await sql`
        SELECT set_config(
          'statement_timeout',
          ${String(this.statementTimeoutMs)},
          true
        )
      `.execute(trx);
      const missingActorResult = await sql<MissingActorCountRow>`
        WITH candidate_scopes AS (
          SELECT i.tenant_id, i.plane
          FROM ai.ai_tool_invocation i
          JOIN ai.atlas_run r
            ON r.tenant_id = i.tenant_id
           AND r.conversation_id = i.thread_id
           AND r.plane = i.plane
           AND r.id = i.run_id
          WHERE i.status IN ('proposed', 'executing')
            AND i.operation_class IN ('unresolved', 'read')
            AND i.confirmation_required = false
            AND i.downstream_command_idempotency_key IS NULL
            AND i.business_transaction_id IS NULL
            AND i.created_at <= ${input.staleBefore}
            AND COALESCE(i.executing_at, i.created_at)
                <= ${input.staleBefore}
            AND (
              (
                r.status IN ('completed', 'failed', 'cancelled')
                AND r.terminal_at IS NOT NULL
                AND r.terminal_at <= ${input.asOf}
              )
              OR (
                r.status = 'started'
                AND r.started_at <= ${input.staleBefore}
              )
            )
          GROUP BY i.tenant_id, i.plane
        )
        SELECT COUNT(*)::int AS missing_actor_scope_count
        FROM candidate_scopes scope
        WHERE NOT EXISTS (
          SELECT 1
          FROM master.principal p
          WHERE p.tenant_id = scope.tenant_id
            AND p.code = 'atlas.maintenance'
            AND p.is_service_account = true
            AND p.is_active = true
            AND p.is_locked = false
        )
      `.execute(trx);
      const result = await sql<RecoveryScopeRow>`
        WITH candidate_scopes AS (
          SELECT
            i.tenant_id,
            i.plane,
            MIN(COALESCE(i.executing_at, i.created_at)) AS oldest_at
          FROM ai.ai_tool_invocation i
          JOIN ai.atlas_run r
            ON r.tenant_id = i.tenant_id
           AND r.conversation_id = i.thread_id
           AND r.plane = i.plane
           AND r.id = i.run_id
          WHERE i.status IN ('proposed', 'executing')
            AND i.operation_class IN ('unresolved', 'read')
            AND i.confirmation_required = false
            AND i.downstream_command_idempotency_key IS NULL
            AND i.business_transaction_id IS NULL
            AND i.created_at <= ${input.staleBefore}
            AND COALESCE(i.executing_at, i.created_at)
                <= ${input.staleBefore}
            AND (
              (
                r.status IN ('completed', 'failed', 'cancelled')
                AND r.terminal_at IS NOT NULL
                AND r.terminal_at <= ${input.asOf}
              )
              OR (
                r.status = 'started'
                AND r.started_at <= ${input.staleBefore}
              )
            )
          GROUP BY i.tenant_id, i.plane
        )
        SELECT
          scope.tenant_id::text AS tenant_id,
          scope.plane,
          actor.id::text AS maintenance_principal_id
        FROM candidate_scopes scope
        JOIN LATERAL (
          SELECT p.id
          FROM master.principal p
          WHERE p.tenant_id = scope.tenant_id
            AND p.code = 'atlas.maintenance'
            AND p.is_service_account = true
            AND p.is_active = true
            AND p.is_locked = false
          ORDER BY p.id
          LIMIT 1
        ) actor ON true
        ORDER BY scope.oldest_at, scope.tenant_id, scope.plane
        LIMIT ${input.batchSize}
      `.execute(trx);
      const missingActorScopeCount = Number(
        missingActorResult.rows[0]?.missing_actor_scope_count ?? 0,
      );
      if (
        !Number.isSafeInteger(missingActorScopeCount)
        || missingActorScopeCount < 0
      ) {
        throw new Error("Invalid Atlas tool recovery readiness count.");
      }
      return Object.freeze({
        scopes: result.rows,
        missingActorScopeCount,
      });
    });
  }
}

function validate(input: RecoverEligibleAtlasToolInvocationsInput): void {
  if (
    !(input.staleBefore instanceof Date)
    || !Number.isFinite(input.staleBefore.getTime())
    || !(input.asOf instanceof Date)
    || !Number.isFinite(input.asOf.getTime())
    || input.asOf.getTime() < input.staleBefore.getTime()
    || !Number.isSafeInteger(input.batchSize)
    || input.batchSize < 1
    || input.batchSize > MAX_BATCH_SIZE
  ) {
    throw new Error("Invalid Atlas tool recovery sweep request.");
  }
}

function parsePlane(value: string): PlaneKey | null {
  return PLANES.has(value as PlaneKey) ? value as PlaneKey : null;
}
