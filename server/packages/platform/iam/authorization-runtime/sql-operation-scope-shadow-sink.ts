import { CompiledQuery, type Kysely } from "kysely";

import type {
  OperationScopeShadowComparison,
  OperationScopeShadowSink,
} from "./operation-scope-shadow.js";

type AnyDb = Kysely<Record<string, never>>;

/** Append-only operational evidence. The comparator treats sink failure as
 * non-authoritative while in shadow mode. */
export class SqlOperationScopeShadowSink implements OperationScopeShadowSink {
  constructor(private readonly db: AnyDb) {}

  async append(comparison: OperationScopeShadowComparison): Promise<void> {
    const candidate = comparison.candidate;
    await this.db.executeQuery(CompiledQuery.raw(`
      INSERT INTO ops.authorization_shadow_comparison (
        tenant_id, plane_code, entity_code, source_entity_operation_id,
        source_release_hash, source_artifact_hash, request_id, cohort_code, correlation_id,
        principal_id, comparison_status, legacy_decision, legacy_reason,
        legacy_fingerprint, candidate_decision, candidate_reason,
        candidate_fingerprint, candidate_error, observed_at, created_by
      ) VALUES (
        $1::uuid,$2,$3,$4::uuid,$5,$6,$7,$8,$9::uuid,$10::uuid,$11,$12,$13,
        $14,$15,$16,$17,$18,$19::timestamptz,$10::uuid
      )
    `, [
      comparison.context.tenantId,
      comparison.coordinate.plane,
      comparison.coordinate.entityCode,
      comparison.coordinate.sourceEntityOperationId,
      comparison.coordinate.sourceReleaseHash,
      comparison.coordinate.sourceArtifactHash,
      comparison.context.requestId,
      comparison.context.cohortCode ?? "legacy_baseline",
      comparison.context.correlationId ?? null,
      comparison.context.principalId,
      comparison.status,
      comparison.legacy.decision,
      comparison.legacy.reason,
      comparison.legacy.fingerprint,
      candidate?.decision ?? null,
      candidate?.reason ?? null,
      candidate?.fingerprint ?? null,
      comparison.candidateError,
      comparison.observedAt,
    ]));
  }
}
