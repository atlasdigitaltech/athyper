import { sql } from "kysely";
import type { AnyDb } from "../ai-runtime.types.js";
import type { PlaneKey } from "@athyper/svc-iam";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLANES = new Set(["neon", "mesh", "admin"]);
const MAX_BATCH_SIZE = 1_000;
const RECOVERY_ERROR_CLASS = "process_interrupted";
const DEFAULT_STATEMENT_TIMEOUT_MS = 1_500;

interface RecoveredRow {
  id: string;
}

export interface RecoverStaleAtlasToolInvocationsInput {
  readonly tenantId: string;
  readonly tenantMaintenancePrincipalId: string;
  readonly plane: PlaneKey;
  readonly staleBefore: Date;
  readonly asOf: Date;
  readonly batchSize: number;
}

export interface RecoverStaleAtlasToolInvocationsResult {
  readonly failedCount: number;
}

export interface SqlAtlasToolInvocationMaintenanceOptions {
  /**
   * Explicit acknowledgement that the supplied connection uses the approved
   * athyperadmin maintenance role. Never construct this class with the web
   * application's tenant role.
   */
  readonly authority: "athyperadmin_atlas_tool_maintenance";
  readonly statementTimeoutMs?: number;
}

/**
 * Admin-only crash recovery for Phase-7C.1 read-only invocations.
 *
 * It terminalizes only old proposed/executing rows whose owning Atlas run is
 * already terminal or itself older than the supplied stale boundary. Existing
 * terminal rows, fresh invocations, live fresh runs, confirmation workflows,
 * and any mutation-shaped row are excluded and cannot be changed.
 */
export class SqlAtlasToolInvocationMaintenanceAuthority {
  private readonly statementTimeoutMs: number;

  constructor(
    private readonly systemDb: AnyDb,
    options: SqlAtlasToolInvocationMaintenanceOptions,
  ) {
    if (options.authority !== "athyperadmin_atlas_tool_maintenance") {
      throw new Error(
        "An approved Atlas tool maintenance DB authority is required.",
      );
    }
    const timeout = options.statementTimeoutMs
      ?? DEFAULT_STATEMENT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 30_000) {
      throw new Error("Invalid Atlas tool maintenance statement timeout.");
    }
    this.statementTimeoutMs = timeout;
  }

  async recoverStale(
    input: RecoverStaleAtlasToolInvocationsInput,
  ): Promise<RecoverStaleAtlasToolInvocationsResult> {
    validate(input);
    return this.systemDb.transaction().execute(async (transaction) => {
      const trx = transaction as unknown as AnyDb;
      await sql`
        SELECT
          set_config('app.current_tenant_id', ${input.tenantId}, true),
          set_config(
            'app.current_principal_id',
            ${input.tenantMaintenancePrincipalId},
            true
          ),
          set_config('app.current_atlas_plane', ${input.plane}, true),
          set_config(
            'statement_timeout',
            ${String(this.statementTimeoutMs)},
            true
          )
      `.execute(trx);
      const recovered = await sql<RecoveredRow>`
        WITH maintenance_actor AS (
          SELECT p.id
          FROM master.principal p
          WHERE p.tenant_id = ${input.tenantId}::uuid
            AND p.id = ${input.tenantMaintenancePrincipalId}::uuid
            AND p.is_service_account = true
            AND p.is_active = true
            AND p.is_locked = false
        ),
        candidates AS (
          SELECT i.id
          FROM ai.ai_tool_invocation i
          JOIN ai.atlas_run r
            ON r.tenant_id = i.tenant_id
           AND r.conversation_id = i.thread_id
           AND r.plane = i.plane
           AND r.id = i.run_id
          WHERE EXISTS (SELECT 1 FROM maintenance_actor)
            AND i.tenant_id = ${input.tenantId}::uuid
            AND i.plane = ${input.plane}
            AND i.status IN ('proposed', 'executing')
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
          ORDER BY
            COALESCE(i.executing_at, i.created_at),
            i.id
          LIMIT ${input.batchSize}
          FOR UPDATE OF i SKIP LOCKED
        )
        UPDATE ai.ai_tool_invocation i
        SET status = 'failed',
            terminal_error_class = ${RECOVERY_ERROR_CLASS},
            result_hash = NULL,
            evidence_refs = '[]'::jsonb,
            business_transaction_type = NULL,
            business_transaction_id = NULL,
            terminal_at = ${input.asOf},
            duration_ms = GREATEST(
              0,
              FLOOR(
                EXTRACT(EPOCH FROM (${input.asOf} - i.created_at)) * 1000
              )::bigint
            ),
            updated_by = ${input.tenantMaintenancePrincipalId}::uuid
        FROM candidates c
        WHERE i.id = c.id
          AND i.tenant_id = ${input.tenantId}::uuid
          AND i.plane = ${input.plane}
          AND i.status IN ('proposed', 'executing')
          AND i.operation_class IN ('unresolved', 'read')
          AND i.confirmation_required = false
        RETURNING i.id
      `.execute(trx);
      return Object.freeze({ failedCount: recovered.rows.length });
    });
  }
}

function validate(input: RecoverStaleAtlasToolInvocationsInput): void {
  if (
    !UUID_RE.test(input.tenantId)
    || !UUID_RE.test(input.tenantMaintenancePrincipalId)
    || !PLANES.has(input.plane)
    || !(input.staleBefore instanceof Date)
    || !Number.isFinite(input.staleBefore.getTime())
    || !(input.asOf instanceof Date)
    || !Number.isFinite(input.asOf.getTime())
    || input.asOf.getTime() < input.staleBefore.getTime()
    || !Number.isSafeInteger(input.batchSize)
    || input.batchSize < 1
    || input.batchSize > MAX_BATCH_SIZE
  ) {
    throw new Error("Invalid Atlas tool maintenance recovery request.");
  }
}
