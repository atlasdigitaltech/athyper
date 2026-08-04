import { CompiledQuery, type Kysely } from "kysely";

import type { CanonicalPlane } from "../authorization-evaluator/index.js";

type AnyDb = Kysely<Record<string, never>>;

export interface AuthorizationInvalidation {
  readonly id: string;
  readonly scopeKind: "global" | "tenant" | "plane";
  readonly tenantOrAccountId?: string;
  readonly plane?: CanonicalPlane;
  readonly globalEpoch: number;
  readonly boundaryEpoch?: number;
  readonly planeEpoch?: number;
  readonly affectedPrincipalIds: readonly string[];
  readonly affectedPermissionIds: readonly string[];
  readonly affectedRecordIds: readonly string[];
  readonly affectedDelegationIds: readonly string[];
}

export interface AuthorizationRuntimeCache {
  invalidate(input: AuthorizationInvalidation): Promise<void>;
}

interface InvalidationRow {
  id: string;
  scope_kind: AuthorizationInvalidation["scopeKind"];
  tenant_id: string | null;
  plane_code: "athyper" | "neon" | "mesh" | null;
  global_epoch: string | number;
  boundary_epoch: string | number | null;
  plane_epoch: string | number | null;
  affected_principal_ids: string[];
  affected_permission_ids: string[];
  affected_record_ids: string[];
  affected_delegation_ids: string[];
}

/**
 * Leased, idempotent consumer for the canonical invalidation outbox. An item
 * is completed only after the cache accepted its monotonic epoch. A failure is
 * returned to the durable retry/dead-letter state machine.
 */
export class AuthorizationInvalidationWorker {
  constructor(
    private readonly db: AnyDb,
    private readonly plane: CanonicalPlane,
    private readonly workerId: string,
    private readonly cache: AuthorizationRuntimeCache,
    private readonly batchSize = 100,
    private readonly leaseSeconds = 60,
    private readonly retrySeconds = 30,
  ) {
    if (!workerId.trim()) throw new Error("invalidation worker ID is required");
  }

  async runOnce(): Promise<{ processed: number; failed: number }> {
    const rows = await this.claim();
    let processed = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.cache.invalidate(toInvalidation(row));
        await this.complete(row.id);
        processed += 1;
      } catch (error) {
        await this.fail(row.id, error);
        failed += 1;
      }
    }
    return { processed, failed };
  }

  private async claim(): Promise<readonly InvalidationRow[]> {
    const result = await this.db.executeQuery<InvalidationRow>(
      CompiledQuery.raw(`
        SELECT
          id::text,
          scope_kind,
          tenant_id::text,
          plane_code,
          global_epoch,
          tenant_epoch AS boundary_epoch,
          plane_epoch,
          affected_principal_ids,
          affected_permission_ids,
          affected_record_ids,
          affected_delegation_ids
        FROM event.fn_authorization_claim_invalidations($1, $2, $3)
      `, [this.workerId, this.batchSize, this.leaseSeconds]),
    );
    return result.rows;
  }

  private async complete(id: string): Promise<void> {
    await this.db.executeQuery(CompiledQuery.raw(`
      SELECT event.fn_authorization_complete_invalidation(
        $1::uuid,
        $2
      )
    `, [id, this.workerId]));
  }

  private async fail(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.db.executeQuery(CompiledQuery.raw(`
      SELECT event.fn_authorization_fail_invalidation(
        $1::uuid,
        $2,
        $3,
        $4
      )
    `, [id, this.workerId, message.slice(0, 4000), this.retrySeconds]));
  }
}

function toInvalidation(row: InvalidationRow): AuthorizationInvalidation {
  return {
    id: row.id,
    scopeKind: row.scope_kind,
    ...(row.tenant_id
      ? { tenantOrAccountId: row.tenant_id }
      : {}),
    ...(row.plane_code ? { plane: toApiPlane(row.plane_code) } : {}),
    globalEpoch: Number(row.global_epoch),
    ...(row.boundary_epoch === null
      ? {}
      : { boundaryEpoch: Number(row.boundary_epoch) }),
    ...(row.plane_epoch === null
      ? {}
      : { planeEpoch: Number(row.plane_epoch) }),
    affectedPrincipalIds: row.affected_principal_ids,
    affectedPermissionIds: row.affected_permission_ids,
    affectedRecordIds: row.affected_record_ids,
    affectedDelegationIds: row.affected_delegation_ids,
  };
}

function toApiPlane(plane: NonNullable<InvalidationRow["plane_code"]>): CanonicalPlane {
  return plane === "athyper" ? "admin" : plane;
}
