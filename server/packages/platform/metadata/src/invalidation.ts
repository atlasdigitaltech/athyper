import { sql, type Kysely } from "kysely";
import type { PlaneKey } from "@athyper/server-foundation/context";
export type InvalidationKind = "metadata" | "authorization";
export interface DurableInvalidation {
  readonly id: string;
  readonly kind: InvalidationKind;
  readonly planeKey: PlaneKey;
  readonly tenantId: string | null;
  readonly scopeKey: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly attemptCount: number;
}
export interface InvalidationRepository {
  claim(input: {
    readonly workerId: string;
    readonly limit: number;
    readonly leaseSeconds: number;
  }): Promise<readonly DurableInvalidation[]>;
  complete(id: string, workerId: string, generation: number): Promise<boolean>;
  fail(input: {
    readonly id: string;
    readonly workerId: string;
    readonly errorCode: string;
    readonly retryAt: string;
    readonly deadLetter: boolean;
    readonly sanitizedPayload: Readonly<Record<string, unknown>>;
  }): Promise<boolean>;
  backlog(): Promise<{
    readonly pending: number;
    readonly oldestCreatedAt: string | null;
  }>;
}
type Database = Kysely<Record<string, never>>;
export function createKyselyInvalidationRepository(
  database: Database,
  planeKey: PlaneKey,
): InvalidationRepository {
  const leasedKinds = new Map<string, InvalidationKind>();
  return {
    async claim(input) {
      validateClaim(input.limit, input.leaseSeconds);
      const auth =
        await sql<AuthRow>`SELECT * FROM event.fn_authorization_claim_invalidations(${input.workerId},${input.limit},${input.leaseSeconds})`.execute(
          database,
        );
      const remaining = Math.max(0, input.limit - auth.rows.length);
      const descriptors = remaining
        ? await sql<DescriptorRow>`WITH candidates AS (SELECT id FROM event.descriptor_invalidation_outbox WHERE attempts<max_attempts AND available_at<=clock_timestamp() AND (status IN ('pending','failed') OR (status='processing' AND locked_until<clock_timestamp())) ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT ${remaining}) UPDATE event.descriptor_invalidation_outbox item SET status='processing',attempts=item.attempts+1,locked_at=clock_timestamp(),locked_by=${input.workerId},locked_until=clock_timestamp()+(${input.leaseSeconds}*interval '1 second'),last_error=NULL FROM candidates WHERE item.id=candidates.id RETURNING item.id::text,item.tenant_id::text,item.entity_code,item.plane_key,item.reason,item.source_table,item.source_id::text,item.payload,item.created_at::text,item.attempts`.execute(
            database,
          )
        : { rows: [] as DescriptorRow[] };
      const result = [
        ...auth.rows.map((row) => toAuthorization(row, planeKey)),
        ...descriptors.rows.map((row) => toDescriptor(row, planeKey)),
      ];
      for (const item of result) leasedKinds.set(item.id, item.kind);
      return result;
    },
    async complete(id, workerId, _generation) {
      const kind = requireKind(leasedKinds, id);
      if (kind === "authorization") {
        const result = await sql<{
          completed: boolean;
        }>`SELECT event.fn_authorization_complete_invalidation(${id}::uuid,${workerId}) AS completed`.execute(
          database,
        );
        return result.rows[0]?.completed === true;
      }
      const result =
        await sql`UPDATE event.descriptor_invalidation_outbox SET status='completed',processed_at=clock_timestamp(),processed_by=${workerId},locked_at=NULL,locked_by=NULL,locked_until=NULL,last_error=NULL WHERE id=${id}::uuid AND status='processing' AND locked_by=${workerId}`.execute(
          database,
        );
      return Number(result.numAffectedRows ?? 0) === 1;
    },
    async fail(input) {
      const kind = requireKind(leasedKinds, input.id);
      const table =
        kind === "authorization"
          ? "authorization_invalidation_outbox"
          : "descriptor_invalidation_outbox";
      return database.transaction().execute(async (transaction) => {
        const updated =
          await sql`UPDATE ${sql.table(`event.${table}`)} SET status=${input.deadLetter ? "dead_letter" : "failed"},available_at=${input.retryAt}::timestamptz,locked_at=NULL,locked_by=NULL,locked_until=NULL,last_error=${input.errorCode} WHERE id=${input.id}::uuid AND status='processing' AND locked_by=${input.workerId}`.execute(
            transaction,
          );
        if (Number(updated.numAffectedRows ?? 0) !== 1) return false;
        if (input.deadLetter) {
          const scope =
            kind === "metadata"
              ? sql.raw("coalesce(entity_code,reason)")
              : sql.raw("scope_kind");
          await sql`INSERT INTO event.invalidation_dead_letter(invalidation_id,kind,plane_key,tenant_id,scope_key,error_code,sanitized_payload,original_created_at,attempt_count) SELECT ${input.id}::uuid,${kind},${planeKey},tenant_id,${scope},${input.errorCode},${JSON.stringify(input.sanitizedPayload)}::jsonb,created_at,attempts FROM ${sql.table(`event.${table}`)} WHERE id=${input.id}::uuid ON CONFLICT(invalidation_id) DO NOTHING`.execute(
            transaction,
          );
        }
        return true;
      });
    },
    async backlog() {
      const result = await sql<{
        pending: string | number;
        oldest_created_at: string | null;
      }>`SELECT sum(count)::text pending,min(oldest)::text oldest_created_at FROM (SELECT count(*) count,min(created_at) oldest FROM event.authorization_invalidation_outbox WHERE status IN ('pending','failed','processing') UNION ALL SELECT count(*),min(created_at) FROM event.descriptor_invalidation_outbox WHERE status IN ('pending','failed','processing')) backlog`.execute(
        database,
      );
      return {
        pending: Number(result.rows[0]?.pending ?? 0),
        oldestCreatedAt: result.rows[0]?.oldest_created_at ?? null,
      };
    },
  };
}
interface AuthRow {
  id: string;
  scope_kind: string;
  tenant_id: string | null;
  plane_code: string | null;
  authority_table: string;
  authority_operation: string;
  source_row_key: unknown;
  created_at: string | Date;
  attempts: number;
}
interface DescriptorRow {
  id: string;
  tenant_id: string | null;
  entity_code: string | null;
  plane_key: string | null;
  reason: string;
  source_table: string | null;
  source_id: string | null;
  payload: unknown;
  created_at: string | Date;
  attempts: number;
}
function toAuthorization(
  row: AuthRow,
  fallback: PlaneKey,
): DurableInvalidation {
  return Object.freeze({
    id: String(row.id),
    kind: "authorization",
    planeKey: asPlane(row.plane_code, fallback),
    tenantId: row.tenant_id,
    scopeKey: row.scope_kind,
    payload: Object.freeze({
      authorityTable: row.authority_table,
      operation: row.authority_operation,
      sourceRowKey: row.source_row_key,
    }),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    attemptCount: Number(row.attempts),
  });
}
function toDescriptor(
  row: DescriptorRow,
  fallback: PlaneKey,
): DurableInvalidation {
  return Object.freeze({
    id: String(row.id),
    kind: "metadata",
    planeKey: asPlane(row.plane_key, fallback),
    tenantId: row.tenant_id,
    scopeKey: row.entity_code ?? row.reason,
    payload: isObject(row.payload)
      ? Object.freeze({
          ...row.payload,
          reason: row.reason,
          sourceTable: row.source_table,
          sourceId: row.source_id,
        })
      : Object.freeze({ reason: row.reason }),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    attemptCount: Number(row.attempts),
  });
}
function requireKind(
  kinds: Map<string, InvalidationKind>,
  id: string,
): InvalidationKind {
  const kind = kinds.get(id);
  if (!kind) throw new Error("INVALIDATION_LEASE_UNKNOWN");
  return kind;
}
function asPlane(value: string | null, fallback: PlaneKey): PlaneKey {
  return value === "studio" || value === "neon" || value === "mesh"
    ? value
    : fallback;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function validateClaim(limit: number, lease: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw new TypeError("Invalid invalidation claim limit");
  if (!Number.isInteger(lease) || lease < 5 || lease > 3600)
    throw new TypeError("Invalid invalidation lease");
}
